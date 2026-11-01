package main

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"time"

	"github.com/gorilla/websocket"
	_ "modernc.org/sqlite"
)

// Config holds the agent configuration.
type Config struct {
	BackendURL     string `json:"backend_url"`
	BranchToken    string `json:"branch_token"`
	BranchID       string `json:"branch_id"`
	PrinterAddress string `json:"printer_address"` // "tcp://host:port" or "usb"
	PrinterPort    int    `json:"printer_port"`
}

// Job represents a print job received from the backend.
type Job struct {
	JobID       string `json:"job_id"`
	OrderID     string `json:"order_id"`
	OrderVersion int    `json:"order_version"`
	Kind        string `json:"kind"`
	PayloadB64  string `json:"payload_base64"`
}

// Message is the WebSocket message envelope.
type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Ack is sent back to the backend after printing.
type Ack struct {
	JobID      string `json:"job_id"`
	Status     string `json:"status"` // PRINTED or FAILED
	ErrorCode  string `json:"error_code,omitempty"`
}

// Heartbeat is sent periodically.
type Heartbeat struct {
	PrinterStatus string `json:"printer_status"`
	QueueDepth    int    `json:"queue_depth"`
}

var db *sql.DB
var conn *websocket.Conn

func main() {
	configPath := "config.json"
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		log.Fatalf("cannot read config: %v", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		log.Fatalf("invalid config: %v", err)
	}

	// Open local spool (SQLite).
	db, err = sql.Open("sqlite", "spool.db")
	if err != nil {
		log.Fatalf("cannot open spool: %v", err)
	}
	defer db.Close()

	// Create spool table.
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS spool (
		job_id TEXT PRIMARY KEY,
		payload BLOB NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		log.Fatalf("cannot create spool table: %v", err)
	}

	// Load already-printed job IDs for deduplication.
	printed := loadPrintedIDs()
	log.Printf("loaded %d printed job IDs", len(printed))

	// Connect to backend.
	wsURL := cfg.BackendURL + "/ws/print?branch=" + cfg.BranchID + "&token=" + cfg.BranchToken
	log.Printf("connecting to %s", wsURL)

	for {
		err := connectAndRun(cfg, wsURL, printed)
		if err != nil {
			log.Printf("connection lost: %v, reconnecting in 5s", err)
		}
		time.Sleep(5 * time.Second)
	}
}

func loadPrintedIDs() map[string]bool {
	result := make(map[string]bool)
	rows, err := db.Query("SELECT job_id FROM spool WHERE status = 'printed'")
	if err != nil {
		return result
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			result[id] = true
		}
	}
	return result
}

func connectAndRun(cfg Config, wsURL string, printed map[string]bool) error {
	var err error
	conn, _, err = websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	// Send hello.
	hello := map[string]interface{}{
		"type": "hello",
		"payload": map[string]string{
			"branch_id":     cfg.BranchID,
			"agent_version": "0.1.0",
		},
	}
	if err := conn.WriteJSON(hello); err != nil {
		return fmt.Errorf("hello: %w", err)
	}

	// Start heartbeat goroutine.
	go heartbeat(cfg)

	// Read messages.
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("read: %w", err)
		}

		var m Message
		if err := json.Unmarshal(msg, &m); err != nil {
			log.Printf("invalid message: %v", err)
			continue
		}

		switch m.Type {
		case "job":
			var job Job
			if err := json.Unmarshal(m.Payload, &job); err != nil {
				log.Printf("invalid job: %v", err)
				continue
			}
			go handleJob(cfg, job, printed)

		case "ping":
			conn.WriteJSON(map[string]string{"type": "pong"})
		}
	}
}

func handleJob(cfg Config, job Job, printed map[string]bool) {
	// Deduplicate.
	if printed[job.JobID] {
		log.Printf("job %s already printed, acking", job.JobID)
		sendAck(job.JobID, "PRINTED", "")
		return
	}

	// Check spool.
	var status string
	err := db.QueryRow("SELECT status FROM spool WHERE job_id = ?", job.JobID).Scan(&status)
	if err == nil && status == "printed" {
		printed[job.JobID] = true
		sendAck(job.JobID, "PRINTED", "")
		return
	}

	// Store in spool.
	payload, err := base64.StdEncoding.DecodeString(job.PayloadB64)
	if err != nil {
		log.Printf("decode error for %s: %v", job.JobID, err)
		sendAck(job.JobID, "FAILED", "decode_error")
		return
	}

	_, err = db.Exec("INSERT OR REPLACE INTO spool (job_id, payload, status) VALUES (?, ?, 'pending')", job.JobID, payload)
	if err != nil {
		log.Printf("spool error for %s: %v", job.JobID, err)
	}

	// Print.
	printerStatus := "online"
	_ = printerStatus
	err = printToPrinter(cfg, payload)
	if err != nil {
		log.Printf("print error for %s: %v", job.JobID, err)
		printerStatus = "offline"
		sendAck(job.JobID, "FAILED", "print_error")
		// Update spool status.
		db.Exec("UPDATE spool SET status = 'failed' WHERE job_id = ?", job.JobID)
		return
	}

	// Mark as printed.
	db.Exec("UPDATE spool SET status = 'printed' WHERE job_id = ?", job.JobID)
	printed[job.JobID] = true
	sendAck(job.JobID, "PRINTED", "")
	log.Printf("job %s printed successfully", job.JobID)
}

func printToPrinter(cfg Config, data []byte) error {
	if cfg.PrinterAddress == "" {
		// No printer configured; simulate success.
		log.Printf("no printer configured, simulating print of %d bytes", len(data))
		return nil
	}

	addr := cfg.PrinterAddress
	if cfg.PrinterPort > 0 {
		addr = fmt.Sprintf("%s:%d", cfg.PrinterAddress, cfg.PrinterPort)
	}

	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		return fmt.Errorf("connect to printer: %w", err)
	}
	defer conn.Close()

	conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	_, err = conn.Write(data)
	if err != nil {
		return fmt.Errorf("write to printer: %w", err)
	}

	// Read status (DLE EOT).
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 1)
	n, _ := conn.Read(buf)
	if n > 0 {
		log.Printf("printer status: 0x%02x", buf[0])
	}

	return nil
}

func sendAck(jobID, status, errorCode string) {
	if conn == nil {
		return
	}
	ack := Ack{JobID: jobID, Status: status, ErrorCode: errorCode}
	msg := Message{Type: "ack", Payload: mustMarshal(ack)}
	conn.WriteJSON(msg)
}

func heartbeat(cfg Config) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		if conn == nil {
			continue
		}
		status := "online"
		// Check printer.
		if cfg.PrinterAddress != "" {
			addr := cfg.PrinterAddress
			if cfg.PrinterPort > 0 {
				addr = fmt.Sprintf("%s:%d", cfg.PrinterAddress, cfg.PrinterPort)
			}
			c, err := net.DialTimeout("tcp", addr, 2*time.Second)
			if err != nil {
				status = "offline"
			} else {
				c.Close()
			}
		}
		hb := Heartbeat{PrinterStatus: status, QueueDepth: 0}
		msg := Message{Type: "heartbeat", Payload: mustMarshal(hb)}
		conn.WriteJSON(msg)
	}
}

func mustMarshal(v interface{}) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}


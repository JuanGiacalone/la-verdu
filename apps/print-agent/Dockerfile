FROM golang:1.27-alpine AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o print-agent .

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/print-agent .
CMD ["./print-agent", "/config.json"]
EOF
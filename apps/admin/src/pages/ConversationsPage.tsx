import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";
import { getConversation, listConversations, resolveConversation } from "../api/endpoints.js";
import type { Conversation } from "../api/types.js";

interface ConvDetail extends Conversation {
  messages: {
    id: string;
    direction: string;
    type: string;
    bodyText: string | null;
    transcript: string | null;
    createdAt: string;
  }[];
}

export function ConversationsPage() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<ConvDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  async function load() {
    try {
      setConvs(await listConversations());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function open(id: string) {
    try {
      setSelected((await getConversation(id)) as ConvDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleResolve() {
    if (!selected) return;
    try {
      await resolveConversation(selected.id);
      await open(selected.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    // Send reply via admin endpoint.
    await apiFetch(`/admin/conversations/${selected.id}/reply`, {
      method: "POST",
      body: JSON.stringify({ text: reply }),
    });
    setReply("");
    await open(selected.id);
  }

  return (
    <div className="space-y-6">
      {error && <div className="text-red-600">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border rounded overflow-y-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left p-2">Teléfono</th>
                <th className="text-left p-2">Tipo</th>
                <th className="text-left p-2">Estado</th>
                <th className="text-left p-2">Último inbound</th>
              </tr>
            </thead>
            <tbody>
              {convs.map((c) => (
                <tr key={c.id} className="border-t hover:bg-slate-50">
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => open(c.id)}
                      className="text-brand-600 hover:text-brand-700 font-medium"
                    >
                      {c.phoneE164}
                    </button>
                  </td>
                  <td className="p-2">{c.actorType}</td>
                  <td className="p-2">{c.state}</td>
                  <td className="p-2">
                    {c.lastInboundAt ? new Date(c.lastInboundAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-white border rounded p-4">
          {!selected ? (
            <p className="text-slate-500">Seleccioná una conversación.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold">
                  {selected.phoneE164} ({selected.state})
                </h2>
                {selected.state === "ESCALATED" && (
                  <button
                    type="button"
                    onClick={handleResolve}
                    className="text-xs px-2 py-1 rounded-md bg-brand-700 hover:bg-brand-900 text-white font-medium"
                  >
                    Resolver
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2 border rounded p-2 bg-slate-50">
                {selected.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`text-sm ${m.direction === "INBOUND" ? "text-slate-800" : "text-brand-700"}`}
                  >
                    <span className="text-xs text-slate-400">{m.direction}</span>{" "}
                    {m.bodyText ?? m.transcript ?? ""}
                  </div>
                ))}
              </div>
              <form onSubmit={handleReply} className="flex gap-2">
                <input
                  className="flex-1 border rounded px-3 py-2"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Responder en nombre del personal"
                />
                <button
                  type="submit"
                  className="bg-brand-700 hover:bg-brand-900 text-white rounded px-4 py-2"
                >
                  Enviar
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

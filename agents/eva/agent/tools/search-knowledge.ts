import { defineTool } from "eve/tools";
import { z } from "zod";

import { getSupabaseAdmin } from "@/lib/supabase/server";

type KnowledgeEntryRow = {
  topic: string;
  question: string;
  answer: string;
  tags: string[] | null;
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function queryTerms(query: string): string[] {
  return normalizeText(query)
    .split(/[^a-z0-9ñ]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

function scoreEntry(entry: KnowledgeEntryRow, terms: string[]): number {
  const topic = normalizeText(entry.topic);
  const question = normalizeText(entry.question);
  const answer = normalizeText(entry.answer);
  const tags = (entry.tags ?? []).map(normalizeText);

  return terms.reduce((score, term) => {
    if (topic.includes(term)) return score + 4;
    if (tags.some((tag) => tag.includes(term))) return score + 3;
    if (question.includes(term)) return score + 2;
    if (answer.includes(term)) return score + 1;
    return score;
  }, 0);
}

export default defineTool({
  description:
    "Busca respuestas aprobadas en la base de conocimiento del consultorio dental. Solo lectura.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Pregunta o tema a buscar"),
  }),
  async execute({ query }: { query: string }) {
    const terms = queryTerms(query);
    if (terms.length === 0) {
      return {
        success: true,
        found: false,
        entries: [],
        message: "Necesito una consulta más específica para buscar en la base de conocimiento.",
      };
    }

    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("whatsapp_knowledge_entries")
        .select("topic, question, answer, tags")
        .eq("status", "approved")
        .order("approved_at", { ascending: false, nullsFirst: false })
        .limit(25);

      if (error) throw new Error(error.message);

      const matches = ((data ?? []) as KnowledgeEntryRow[])
        .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
        .filter((match) => match.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ entry }) => ({
          topic: entry.topic,
          question: entry.question,
          answer: entry.answer,
        }));

      if (matches.length === 0) {
        return {
          success: true,
          found: false,
          entries: [],
          message: "No encontré información aprobada relacionada. Si es necesario, escala a humano.",
        };
      }

      return {
        success: true,
        found: true,
        entries: matches,
      };
    } catch (error) {
      return {
        success: false,
        found: false,
        entries: [],
        error: error instanceof Error ? error.message : "No se pudo buscar en la base de conocimiento.",
      };
    }
  },
});

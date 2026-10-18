import { load } from "npm:cheerio@1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "Método não permitido." }, { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const isbn = String(body?.isbn ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
    if (!/^\d{9}[\dX]$/.test(isbn) && !/^\d{13}$/.test(isbn)) {
      return Response.json({ error: "Introduz um ISBN-10 ou ISBN-13 válido." }, { status: 400, headers: corsHeaders });
    }

    const url = "https://isbnsearch.org/isbn/" + encodeURIComponent(isbn);
    const response = await fetch(url, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; BibliothecaISBNLookup/1.0)",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return Response.json({ error: `O ISBN Search respondeu com HTTP ${response.status}.`, url }, { status: 502, headers: corsHeaders });
    }

    const html = await response.text();
    if (/cf-turnstile|challenge-platform|Just a moment|verify you are human/i.test(html)) {
      return Response.json({
        error: "O ISBN Search bloqueou a consulta automática com uma verificação anti-bot. Abre o ISBN Search no navegador e confirma os dados manualmente.",
        challenge: true,
        url,
      }, { status: 424, headers: corsHeaders });
    }

    // Parse HTML structurally so nested divs do not truncate the book record.
    const $ = load(html);
    const book = $("#book");
    const info = book.find(".bookinfo").first();
    const title = info.find("h1").first().text().trim();

    if (!title) {
      // Return only diagnostics, never the full upstream HTML.
      const pageTitle = $("title").text().trim();
      const hasBookContainer = book.length > 0;
      return Response.json({
        error: "O ISBN Search respondeu, mas não foi possível identificar a ficha do livro.",
        url,
        diagnostic: { pageTitle, hasBookContainer, responseUrl: response.url },
      }, { status: 404, headers: corsHeaders });
    }

    const readField = (label: string) => {
      let value = "";
      info.find("p").each((_index, element) => {
        const row = $(element);
        const name = row.find("strong").first().text().trim().replace(/:$/, "").toLowerCase();
        if (name === label.toLowerCase()) {
          value = row.clone().children("strong").remove().end().text().replace(/^\s*[:：-]?\s*/, "").trim();
          return false;
        }
      });
      return value;
    };

    const coverPath = book.find(".image img").first().attr("src") ?? "";
    const cover = coverPath ? new URL(coverPath, url).href.replace(/^http:\/\//i, "https://") : "";
    const authorText = readField("Author");

    return Response.json({
      title,
      authors: authorText.split(/\s*;\s*|\s*,\s*(?=[A-ZÀ-Ý])/).map((name) => name.trim()).filter(Boolean),
      publisher: readField("Publisher"),
      year: readField("Published").match(/\d{4}/)?.[0] ?? "",
      isbn,
      cover,
      source: "ISBN Search",
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("isbn-search error", error);
    return Response.json({ error: "Não foi possível consultar o ISBN Search neste momento." }, { status: 500, headers: corsHeaders });
  }
});

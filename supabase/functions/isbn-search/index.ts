const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function field(html: string, label: string): string {
  const paragraphs = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [];
  const row = paragraphs.find((p) => {
    const strong = p.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i)?.[1] ?? "";
    return decodeHtml(strong).replace(/:$/, "").toLowerCase() === label.toLowerCase();
  });
  if (!row) return "";
  return decodeHtml(row.replace(/^[\s\S]*?<strong\b[^>]*>[\s\S]*?<\/strong>/i, "").replace(/^[\s:：-]+/, ""));
}

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

    const response = await fetch("https://isbnsearch.org/isbn/" + encodeURIComponent(isbn), {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; BibliothecaISBNLookup/1.0)",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      return Response.json({ error: `O ISBN Search respondeu com HTTP ${response.status}.` }, { status: 502, headers: corsHeaders });
    }

    const html = await response.text();
    if (/cf-turnstile|challenge-platform|Just a moment|verify you are human/i.test(html)) {
      return Response.json({
        error: "O ISBN Search bloqueou a consulta automática com uma verificação anti-bot. Abre o ISBN Search no navegador e confirma os dados manualmente.",
        challenge: true,
        url: "https://isbnsearch.org/isbn/" + isbn,
      }, { status: 424, headers: corsHeaders });
    }

    const bookBlock = html.match(/<div\b[^>]*id=["']book["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] ?? html;
    const title = decodeHtml(bookBlock.match(/<div\b[^>]*class=["'][^"']*bookinfo[^"']*["'][^>]*>[\s\S]*?<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
    if (!title) {
      return Response.json({ error: "O ISBN Search não encontrou este ISBN ou não devolveu uma ficha legível.", url: "https://isbnsearch.org/isbn/" + isbn }, { status: 404, headers: corsHeaders });
    }
    const info = bookBlock.match(/<div\b[^>]*class=["'][^"']*bookinfo[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? bookBlock;
    const coverPath = bookBlock.match(/<div\b[^>]*class=["'][^"']*image[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*src=["']([^"']+)["']/i)?.[1] ?? "";
    const cover = coverPath ? new URL(coverPath, "https://isbnsearch.org").href.replace(/^http:\/\//i, "https://") : "";

    return Response.json({
      title,
      authors: field(info, "Author").split(/\s*;\s*|\s*,\s*(?=[A-ZÀ-Ý])/).map((s) => s.trim()).filter(Boolean),
      publisher: field(info, "Publisher"),
      year: field(info, "Published").match(/\d{4}/)?.[0] ?? "",
      isbn,
      cover,
      source: "ISBN Search",
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("isbn-search error", error);
    return Response.json({ error: "Não foi possível consultar o ISBN Search neste momento." }, { status: 500, headers: corsHeaders });
  }
});

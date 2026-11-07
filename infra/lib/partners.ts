// The origins allowed to frame harpguru.com's embeds, under /e/*. They go into
// the embed policy's frame-ancestors, so a browser refuses to show an embed on
// any other site.
//
// Kept in code, not deploy.local.json: every one is sent to every visitor in
// that header anyway. Each is an origin, scheme and host only, such as
// 'https://www.example.com'. Adding one is a change here and a deploy of
// HarpguruSite.
export const EMBED_PARTNER_ORIGINS: readonly string[] = []

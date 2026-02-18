import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { gamesRouter } from "./routes/games.js";

const app = new Hono();

app.get("/", (c) => c.json({ name: "chain-tactics-server", version: "0.0.0" }));

app.route("/games", gamesRouter);

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});

export default app;

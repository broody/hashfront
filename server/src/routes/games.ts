import { Hono } from "hono";

export const gamesRouter = new Hono();

// List all games
gamesRouter.get("/", (c) => {
  return c.json({ games: [] });
});

// Get game by ID
gamesRouter.get("/:id", (c) => {
  const id = c.req.param("id");
  return c.json({ id, status: "not_found" }, 404);
});

// Get agent state for a game
gamesRouter.get("/:id/agent", (c) => {
  const id = c.req.param("id");
  return c.json({ gameId: id, agent: null });
});

// Get chat history for a game
gamesRouter.get("/:id/chat", (c) => {
  const id = c.req.param("id");
  return c.json({ gameId: id, messages: [] });
});

// Player sends message to agent
gamesRouter.post("/:id/chat", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  return c.json({
    gameId: id,
    message: body.message ?? "",
    reply: "Agent not yet implemented",
  });
});

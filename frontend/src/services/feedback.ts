export type FeedbackTone = "success" | "info" | "error";

export type AppFeedback = {
  id: number;
  message: string;
  tone: FeedbackTone;
};

type Listener = (feedback: AppFeedback) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function showFeedback(
  message: string,
  tone: FeedbackTone = "success",
): void {
  const feedback = { id: nextId++, message, tone };
  for (const listener of listeners) listener(feedback);
}

export function subscribeFeedback(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Deliver one action at a time; retain it until the page acknowledges it.
export class CaptionCommands {
  pending = new Map();

  enqueue(tabId, command) {
    const queue = this.pending.get(tabId) || [];
    if (queue.length >= 24) throw new Error('Too many pending caption actions');
    queue.push(command);
    this.pending.set(tabId, queue);
  }

  next(tabId, result, videoId, now = Date.now()) {
    let queue = this.pending.get(tabId) || [];
    if (result?.id === queue[0]?.id) queue.shift();
    queue = queue.filter(command => command.videoId === videoId && now - command.queuedAt < 15000);
    if (!queue.length) { this.pending.delete(tabId); return undefined; }
    this.pending.set(tabId, queue);
    return { ...queue[0], createdAt: now };
  }

  delete(tabId) { this.pending.delete(tabId); }
}

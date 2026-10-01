/**
 * Which gifts this browser made.
 *
 * There is no login anywhere in Lantern - the link is the capability. But the
 * sender and the recipient need different things from the same URL: the sender
 * is offered the chance to leave their voice on the objects, and the recipient
 * must never see that, because being asked to record a message on a gift you
 * were given makes no sense at all.
 *
 * The one thing that reliably separates them is that the sender's browser is
 * the one that made it. That is not identity and is not security - clearing
 * site data loses it, and anyone holding the link could still post a voice
 * note through the API. It is only here to decide which screen to show.
 */

const KEY = "lantern.mine";

function all(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    // Private windows and blocked storage both throw. Neither is an error
    // worth surfacing; the visitor simply gets the recipient's view.
    return [];
  }
}

export function rememberMine(id: string): void {
  try {
    const ids = all();
    if (!ids.includes(id)) localStorage.setItem(KEY, JSON.stringify([...ids, id]));
  } catch {
    // Nothing to do, and nothing worth telling anyone about.
  }
}

export function isMine(id: string): boolean {
  return all().includes(id);
}

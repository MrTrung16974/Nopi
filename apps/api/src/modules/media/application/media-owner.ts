import type { Actor } from '../../../platform/index.js';
import type { MediaOwner } from './media.service.js';

export const ownerOf = (actor: Actor): MediaOwner =>
  actor.kind === 'user' ? { kind: 'user', userId: actor.userId } : { kind: 'student', studentId: actor.studentId };

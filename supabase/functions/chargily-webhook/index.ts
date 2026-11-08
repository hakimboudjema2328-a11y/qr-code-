import { environment } from '../_shared/common.js';
import { webhookHandler } from './handler.js';
Deno.serve((request) => webhookHandler(request, environment()));

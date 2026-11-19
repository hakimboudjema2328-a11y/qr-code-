import { environment } from '../_shared/common.js';
import { clientAuthHandler } from './handler.js';
Deno.serve((request) => clientAuthHandler(request, environment()));

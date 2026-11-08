import { environment } from '../_shared/common.js';
import { adminAuthHandler } from './handler.js';
Deno.serve((request) => adminAuthHandler(request, environment()));

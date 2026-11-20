import { environment } from '../_shared/common.js';
import { resolveQrHandler } from './handler.js';
Deno.serve((request) => resolveQrHandler(request, environment()));

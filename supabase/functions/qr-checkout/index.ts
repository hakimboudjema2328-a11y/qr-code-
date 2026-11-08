import { environment } from '../_shared/common.js';
import { checkoutHandler } from './handler.js';
Deno.serve((request) => checkoutHandler(request, environment()));

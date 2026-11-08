import { environment } from '../_shared/common.js';
import { orderHandler } from './handler.js';
Deno.serve((request) => orderHandler(request, environment()));

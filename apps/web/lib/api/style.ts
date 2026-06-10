import type { CustomStylePrompt, ApiResponse } from '@/types/character';
import { API_BASE, jsonHeaders } from './client';

/**
 * Custom-style API client.
 *
 * The backend exposes a small CRUD surface for user-defined style prompts
 * (see `apps/api/src/routes/style/index.ts`):
 *
 *   GET    /api/styles         → list current user's custom styles
 *   POST   /api/styles         → create a new custom style
 *   PUT    /api/styles/:id     → update an existing custom style
 *   DELETE /api/styles/:id     → delete a custom style
 *
 * Every endpoint is preHandler-authenticated; the standard `authHeaders()`
 * path inside `jsonHeaders()` will attach the JWT bearer token automatically.
 *
 * The wire shape returned by the server matches the `CustomStylePrompt`
 * type already declared in `apps/web/types/character.ts` (id / name / prompt /
 * colorTheme / iconName). It is also the same shape we POST into the
 * `/api/characters/:id/stylize` endpoint as the `style` field's custom
 * branch — so the same `CustomStylePrompt` instance can be both saved and
 * consumed in one round-trip.
 */

export interface CreateCustomStyleInput {
  name: string;
  prompt: string;
  colorTheme: string;
  iconName: string;
}

export type UpdateCustomStyleInput = Partial<CreateCustomStyleInput>;

/**
 * Fetch the current user's saved custom styles, newest first.
 * Returns an empty array when the user has not created any.
 */
export async function listCustomStyles(): Promise<CustomStylePrompt[]> {
  const response = await fetch(`${API_BASE}/api/styles`, {
    method: 'GET',
    headers: jsonHeaders(),
  });

  const result: ApiResponse<CustomStylePrompt[]> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '获取自定义风格失败');
  }
  return result.data || [];
}

/**
 * Create a new custom style for the current user.
 * Server-side zod enforces: name 1-30 chars, prompt 1-2000 chars,
 * colorTheme/iconName from a fixed enum. We let the 400 bubble up so the
 * editor can surface the validation message verbatim.
 */
export async function createCustomStyle(
  input: CreateCustomStyleInput
): Promise<CustomStylePrompt> {
  const response = await fetch(`${API_BASE}/api/styles`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });

  const result: ApiResponse<CustomStylePrompt> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '创建自定义风格失败');
  }
  return result.data!;
}

/**
 * Patch an existing custom style. All fields optional — only the keys
 * present in the input are forwarded as the update payload.
 */
export async function updateCustomStyle(
  id: string,
  input: UpdateCustomStyleInput
): Promise<CustomStylePrompt> {
  const response = await fetch(`${API_BASE}/api/styles/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: jsonHeaders(),
    body: JSON.stringify(input),
  });

  const result: ApiResponse<CustomStylePrompt> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '更新自定义风格失败');
  }
  return result.data!;
}

/**
 * Delete a custom style. The server returns `{ success: true, message: 'Style deleted' }`
 * with no data payload; we ignore the body and just surface any error.
 */
export async function deleteCustomStyle(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/styles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: jsonHeaders(),
  });

  const result: ApiResponse<null> = await response.json();
  if (!result.success) {
    throw new Error(result.message || '删除自定义风格失败');
  }
}

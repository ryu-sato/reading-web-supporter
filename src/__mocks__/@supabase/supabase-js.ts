/**
 * @supabase/supabase-js のJestモック
 */

export const createClient = jest.fn(() => ({
  from: jest.fn(() => ({
    insert: jest.fn().mockResolvedValue({ data: [{ id: 'mock-id', created_at: new Date().toISOString() }], error: null }),
    select: jest.fn().mockResolvedValue({ data: [], error: null }),
  })),
  rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
}));

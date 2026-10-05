// `AuthController` in apps/api (`@Controller('auth')`). The JWT payload is
// `{ sub, username, iat, exp }`; there is no refresh, logout or `/me` endpoint.
import { apiRequest } from './client'

/** POST /auth/login (public). 401 for wrong credentials. */
export function login(username: string, password: string): Promise<{ token: string }> {
  return apiRequest('/auth/login', { method: 'POST', body: { username, password } })
}

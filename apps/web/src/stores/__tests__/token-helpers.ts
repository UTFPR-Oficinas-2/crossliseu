// Unsigned JWTs for specs: the store only decodes the payload, nothing verifies the signature.
export function makeToken(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'none' })}.${encode(payload)}.sig`
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

/** A token for `username` that expires in 2 hours, like the API's */
export function liveToken(username = 'admin'): string {
  return makeToken({ sub: '1', username, iat: nowSeconds(), exp: nowSeconds() + 7200 })
}

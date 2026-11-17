import crypto from 'crypto'

module.exports = () => {
  const invoices = new Map()
  const waiters = new Map()

  const invoice = async ({ description, amount, currency, expiry, metadata }) => {
    const id = 'mock_inv_' + crypto.randomBytes(8).toString('hex')
    const now = Math.floor(Date.now() / 1000)
    const msatoshi = Math.round((parseFloat(amount) || 0.001) * 100000000000)
    const payreq = `lnbc${msatoshi}n1mock${crypto.randomBytes(32).toString('hex')}`
    const inv = {
      id,
      description,
      amount,
      currency,
      quoted_currency: currency,
      quoted_amount: amount,
      msatoshi,
      payreq,
      status: 'unpaid',
      created_at: now,
      expires_at: now + (expiry || 3600),
      paid_at: null,
      metadata: metadata || {}
    }
    invoices.set(id, inv)
    return inv
  }

  const fetch = async id => {
    const inv = invoices.get(id)
    if (!inv) return null
    if (inv.status === 'unpaid' && Math.floor(Date.now() / 1000) > inv.expires_at) {
      inv.status = 'expired'
    }
    return inv
  }

  const wait = async (id, timeout = 30) => {
    const inv = await fetch(id)
    if (!inv) return null
    if (inv.status === 'paid') return inv
    if (inv.status === 'expired') return null

    return new Promise(resolve => {
      let timer = null
      const onPaid = paidInv => {
        if (timer) clearTimeout(timer)
        resolve(paidInv)
      }
      if (!waiters.has(id)) waiters.set(id, new Set())
      waiters.get(id).add(onPaid)

      timer = setTimeout(() => {
        if (waiters.has(id)) {
          waiters.get(id).delete(onPaid)
          if (waiters.get(id).size === 0) waiters.delete(id)
        }
        resolve(null)
      }, Math.min(timeout * 1000, 5000))
    })
  }

  const mockPay = async id => {
    const inv = invoices.get(id)
    if (!inv) return null
    inv.status = 'paid'
    inv.paid_at = Math.floor(Date.now() / 1000)
    if (waiters.has(id)) {
      for (const cb of waiters.get(id)) {
        try { cb(inv) } catch (_) {}
      }
      waiters.delete(id)
    }
    return inv
  }

  return { invoice, fetch, wait, mockPay }
}

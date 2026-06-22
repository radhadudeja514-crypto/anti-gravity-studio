/**
 * assets/js/qr.js
 * Server-validated UPI QR generation
 */

/**
 * Generates a QR code for a UPI payment via the server-side validated endpoint.
 * @param {string} upiId   - UPI address (e.g. radha@okicici)
 * @param {number} amount  - Amount in INR
 * @param {string} name    - Payee display name
 * @param {HTMLElement} container - Element to inject the QR image into
 */
export async function generateQR(upiId, amount, name, container) {
  if (!container) return;

  container.innerHTML = `
    <div style="text-align:center;padding:2rem;color:rgba(255,255,255,0.5)">
      <span style="font-size:1.5rem">⏳</span><br>Generating QR…
    </div>`;

  try {
    const res = await fetch('/api/generate-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upiId, amount, name }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Server error');
    }

    const { qrUrl, uri } = await res.json();

    container.innerHTML = `
      <div style="text-align:center">
        <img src="${qrUrl}"
             alt="UPI QR Code — scan to pay ₹${amount} to ${name}"
             width="240" height="240"
             style="border-radius:1rem;background:#fff;padding:0.75rem" />
        <p style="margin-top:0.75rem;font-size:0.8rem;color:rgba(255,255,255,0.5)">
          Scan with any UPI app (PhonePe, GPay, Paytm, BHIM)
        </p>
        <a href="${uri}"
           style="display:inline-block;margin-top:0.5rem;font-size:0.85rem;color:#00f9ff;"
           aria-label="Open in UPI app">
          Open in UPI App →
        </a>
      </div>`;
  } catch (err) {
    container.innerHTML = `
      <div style="text-align:center;padding:1.5rem;color:#ff6b6b">
        ⚠️ QR Error: ${err.message}
      </div>`;
  }
}

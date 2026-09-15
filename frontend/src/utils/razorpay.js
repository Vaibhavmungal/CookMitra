// Razorpay Checkout helpers (pay-before-booking).
// Loads checkout.js on demand and opens the payment modal for a backend order.

let scriptPromise = null;

export const loadRazorpayScript = () => {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return scriptPromise;
};

// Opens Razorpay Checkout for an order created via POST /api/payments/order.
// Resolves with { razorpay_order_id, razorpay_payment_id, razorpay_signature }.
// Rejects when the user closes the modal or the SDK fails to load.
export const openRazorpayCheckout = async ({
  keyId,
  orderId,
  amountPaise,
  currency = "INR",
  name = "Cook Mitra",
  description = "Cook booking fee",
  prefill = {},
}) => {
  const loaded = await loadRazorpayScript();
  if (!loaded || !window.Razorpay) {
    throw new Error("Payment gateway failed to load. Check your connection and retry.");
  }
  const rawKey = keyId || process.env.REACT_APP_RAZORPAY_KEY_ID || "";
  const looksPlaceholder = (v) =>
    !v ||
    /x{4,}/i.test(v) ||
    /^your_/i.test(v) ||
    /example/i.test(v) ||
    /change_?me/i.test(v);
  if (looksPlaceholder(rawKey)) {
    throw new Error(
      "Online payments are not configured yet on this site. Please try cash/UPI on service day or contact support."
    );
  }
  const key = rawKey;
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key,
      amount: amountPaise,
      currency,
      name,
      description,
      order_id: orderId,
      prefill,
      theme: { color: "#C2410C" },
      handler: (response) => resolve(response),
      modal: {
        ondismiss: () => reject(new Error("Payment cancelled — your booking was not created.")),
      },
    });
    rzp.on("payment.failed", (resp) => {
      reject(new Error(resp?.error?.description || "Payment failed — your booking was not created."));
    });
    rzp.open();
  });
};

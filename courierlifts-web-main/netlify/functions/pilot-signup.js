exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");

    // You can store signups or email them — for now, just log them
    console.log("Pilot signup:", body);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};

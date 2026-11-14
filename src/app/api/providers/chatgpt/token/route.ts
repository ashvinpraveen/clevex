/** Token exchanges now happen exclusively inside the protected local runtime. */
export async function POST() {
  return Response.json(
    { error: "Connect ChatGPT using the official local sign-in flow." },
    { status: 410 },
  );
}

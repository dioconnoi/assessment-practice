import AttemptRunner from "./AttemptRunner";

export default async function AttemptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AttemptRunner attemptId={Number(id)} />;
}

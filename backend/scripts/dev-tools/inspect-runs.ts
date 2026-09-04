import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspectRuns() {
  const runs = await prisma.reconciliationRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      _count: {
        select: {
          matchResults: true,
          exceptionLogs: true,
        },
      },
    },
  });

  console.log('=== LATEST 5 RECONCILIATION RUNS ===');
  for (const r of runs) {
    console.log({
      id: r.id,
      totalRecords: r.totalRecords,
      matchedRecords: r.matchedRecords,
      exceptionsField: r.exceptions,
      matchResultsCount: r._count.matchResults,
      exceptionLogsCount: r._count.exceptionLogs,
      durationMs: r.durationMs,
      status: r.status,
      createdAt: r.createdAt,
    });
  }

  // Check exception log distribution by source for the latest run
  if (runs.length > 0) {
    const latestId = runs[0].id;
    const exceptions = await prisma.exceptionLog.findMany({
      where: { runId: latestId },
    });
    console.log(`\n=== EXCEPTION LOGS FOR ${latestId} (Total: ${exceptions.length}) ===`);
    const bySource: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const e of exceptions) {
      bySource[e.source] = (bySource[e.source] || 0) + 1;
      byType[e.type] = (byType[e.type] || 0) + 1;
    }
    console.log('By source:', bySource);
    console.log('By type:', byType);
  }

  await prisma.$disconnect();
}

inspectRuns().catch(console.error);

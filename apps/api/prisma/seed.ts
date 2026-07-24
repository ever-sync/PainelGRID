import { randomBytes } from 'crypto';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_SALT_ROUNDS } from '../src/common/constants/bcrypt.constants';
import { signCheckinVoucher } from '../src/common/checkin-voucher.util';
import {
  clientIdToStageCode,
  provisionDefaultCrmPipeline,
} from '../src/modules/crm/default-crm-pipeline';

const prisma = new PrismaClient();

async function upsertUser(
  email: string,
  name: string,
  role: Role,
  passwordHash: string,
  clientId?: string | null,
) {
  await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role,
      password_hash: passwordHash,
      is_active: true,
      ...(clientId !== undefined ? { client_id: clientId } : {}),
    },
    create: {
      name,
      email,
      role,
      password_hash: passwordHash,
      is_active: true,
      client_id: clientId ?? null,
    },
  });
}

async function main() {
  const gestorEmail = (process.env.SEED_GESTOR_EMAIL || 'gestor@leadflow.com').toLowerCase().trim();
  const gestorPassword = process.env.SEED_GESTOR_PASSWORD || 'Leadflow@2026';
  const gestorName = (process.env.SEED_GESTOR_NAME || 'Gestor EverSync').trim();

  const demoPassword = process.env.SEED_DEMO_PASSWORD || 'Leadflow@2026';
  const gestorHash = await bcrypt.hash(gestorPassword, BCRYPT_SALT_ROUNDS);
  const demoHash = await bcrypt.hash(demoPassword, BCRYPT_SALT_ROUNDS);

  await upsertUser(gestorEmail, gestorName, Role.gestor, gestorHash, null);
  await upsertUser('cliente@leadflow.com', 'Cliente Demo', Role.cliente, demoHash);
  await upsertUser('vendedor@leadflow.com', 'Vendedor Demo', Role.vendedor, demoHash);
  await upsertUser('recepcao@leadflow.com', 'Recepcao Demo', Role.recepcao, demoHash);

  const gestor = await prisma.user.findUniqueOrThrow({
    where: { email: gestorEmail },
  });

  console.log(
    `[seed] Gestor: ${gestorEmail} (senha: SEED_GESTOR_PASSWORD ou padrao Leadflow@2026)`,
  );

  let demoClient = await prisma.client.findFirst({
    where: { gestor_id: gestor.id, company_name: 'Empresa Demo' },
  });
  if (!demoClient) {
    demoClient = await prisma.client.create({
      data: {
        gestor_id: gestor.id,
        company_name: 'Empresa Demo',
        plan: 'basic',
      },
    });
  }

  await prisma.user.updateMany({
    where: {
      email: { in: ['cliente@leadflow.com', 'vendedor@leadflow.com', 'recepcao@leadflow.com'] },
    },
    data: { client_id: demoClient.id },
  });

  const allClients = await prisma.client.findMany({ select: { id: true } });
  for (const client of allClients) {
    await provisionDefaultCrmPipeline(prisma, client.id);
    console.log(`[seed] Pipeline CRM padrao (18 etapas) provisionado para cliente ${client.id}`);
  }

  await seedDemoCrmEventsLeadsCourses(demoClient.id);
}

/** Pipeline CRM, evento, lead com convite e curso publicado — para smoke / E2E. */
async function seedDemoCrmEventsLeadsCourses(clientId: string) {
  const { pipeline_id: pipelineId } = await provisionDefaultCrmPipeline(prisma, clientId);
  const pipeline = await prisma.crmPipeline.findUniqueOrThrow({ where: { id: pipelineId } });
  const stage1 = await prisma.crmStage.findUniqueOrThrow({
    where: { code: clientIdToStageCode(clientId, 'NOVO_LEAD') },
  });

  let event = await prisma.event.findFirst({
    where: { client_id: clientId, name: 'Evento Demo' },
  });
  if (!event) {
    event = await prisma.event.create({
      data: {
        client_id: clientId,
        name: 'Evento Demo',
        description: 'Evento para smoke',
        event_date: new Date(),
        location: 'Local Demo',
        status: 'active',
      },
    });
  }

  let lead = await prisma.lead.findFirst({
    where: { client_id: clientId, name: 'Lead Demo Check-in' },
  });

  const checkinToken = lead?.checkin_token ?? randomBytes(24).toString('hex');

  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        client_id: clientId,
        name: 'Lead Demo Check-in',
        source: 'manual',
        crm_pipeline_id: pipeline.id,
        crm_stage_id: stage1.id,
        event_interest_id: event.id,
        confirmation_status: 'pending',
        checkin_token: checkinToken,
      },
    });
  } else {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        crm_pipeline_id: pipeline.id,
        crm_stage_id: stage1.id,
        event_interest_id: event.id,
        ...(lead.checkin_token ? {} : { checkin_token: checkinToken }),
      },
    });
    lead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
  }

  const voucherSecret =
    process.env.LEADFLOW_CHECKIN_VOUCHER_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    'leadflow_access_secret';
  const token = signCheckinVoucher(
    voucherSecret,
    lead.id,
    clientId,
    lead.checkin_token!,
    60 * 60 * 24 * 30,
  );
  const baseUrl = process.env.SEED_PUBLIC_APP_URL?.replace(/\/+$/, '') || 'http://localhost:5173';
  console.log(
    `[seed] Convite demo (preview publico): ${baseUrl}/convite?v=${encodeURIComponent(token)}`,
  );

  let course = await prisma.course.findFirst({ where: { name: 'Curso Demo' } });
  if (!course) {
    course = await prisma.course.create({
      data: {
        name: 'Curso Demo',
        description: 'Curso publicado para smoke / E2E',
        is_published: true,
        price: 0,
        category: 'demo',
      },
    });
    await prisma.lesson.create({
      data: {
        course_id: course.id,
        title: 'Aula 1 — Introducao',
        display_order: 1,
        duration_minutes: 5,
        content_text: 'Conteudo da aula demo.',
      },
    });
    console.log('[seed] Curso Demo + 1 aula criados (publicado).');
  } else {
    await prisma.course.update({
      where: { id: course.id },
      data: { is_published: true },
    });
    const hasLesson = await prisma.lesson.count({ where: { course_id: course.id } });
    if (hasLesson === 0) {
      await prisma.lesson.create({
        data: {
          course_id: course.id,
          title: 'Aula 1 — Introducao',
          display_order: 1,
          duration_minutes: 5,
        },
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

import { randomUUID } from "node:crypto";
import { type Database, one } from "./db.js";
import { digest, hashPassword, opaqueToken } from "./security.js";

// Fictitious opportunities are scoped to one demo organization, never to the public feed.
export async function createDemo(db: Database) {
  const orgId = randomUUID();
  const userId = randomUUID();
  await db.query(
    `INSERT INTO organizations(id,name,is_demo,profile) VALUES($1,$2,true,$3)`,
    [
      orgId,
      "Aurora Soluções · Demonstração",
      JSON.stringify({
        segments: ["Tecnologia da informação", "Serviços empresariais"],
        states: ["RS", "SC", "PR", "PA", "SP"],
        cities: [],
        keywords: [
          "notebooks",
          "computadores",
          "equipamentos",
          "suporte",
          "impressoras",
        ],
        excludedKeywords: ["usados"],
        modalities: ["Pregão - Eletrônico"],
        minValue: 10000,
        maxValue: 1500000,
      }),
    ],
  );
  await db.query(
    "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
    [
      userId,
      "Marina · Demonstração",
      `demo-${orgId}@demo.invalid`,
      await hashPassword(opaqueToken()),
    ],
  );
  await db.query(
    "INSERT INTO members(organization_id,user_id,role) VALUES($1,$2,'ADMIN')",
    [orgId, userId],
  );
  const offerings = [
    [
      "PRODUCT",
      "Notebooks corporativos",
      "Equipamentos para uso administrativo, com garantia e suporte.",
      "Informática",
      ["notebooks", "computadores"],
    ],
    [
      "PRODUCT",
      "Impressoras multifuncionais",
      "Impressão e digitalização para escritórios.",
      "Equipamentos",
      ["impressoras", "multifuncionais"],
    ],
    [
      "SERVICE",
      "Suporte técnico de TI",
      "Manutenção preventiva, help desk e suporte de infraestrutura.",
      "Serviços",
      ["suporte", "manutenção", "infraestrutura"],
    ],
  ];
  for (const [type, name, description, category, keywords] of offerings)
    await db.query(
      "INSERT INTO catalog(id,organization_id,type,name,description,category,keywords) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        randomUUID(),
        orgId,
        type,
        name,
        description,
        category,
        JSON.stringify(keywords),
      ],
    );
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86400000).toISOString();
  const fixtures = [
    [
      "Aquisição de notebooks para modernização administrativa",
      "Secretaria Municipal de Gestão — Exemplo",
      "RS",
      "Porto Alegre",
      428500,
      12,
      "IN_ANALYSIS",
    ],
    [
      "Contratação de suporte e manutenção de computadores",
      "Fundação Estadual de Serviços — Exemplo",
      "SC",
      "Florianópolis",
      286000,
      5,
      "WILL_PARTICIPATE",
    ],
    [
      "Registro de preços para impressoras e equipamentos de TI",
      "Instituto Municipal de Educação — Exemplo",
      "PR",
      "Curitiba",
      612800,
      21,
      "IDENTIFIED",
    ],
    [
      "Fornecimento de computadores para unidades de atendimento",
      "Secretaria de Administração — Exemplo",
      "PA",
      "Belém",
      895000,
      3,
      "WILL_PARTICIPATE",
    ],
    [
      "Serviços de suporte técnico e infraestrutura de rede",
      "Autarquia de Desenvolvimento — Exemplo",
      "SP",
      "São Paulo",
      174600,
      8,
      "PROPOSAL_SENT",
    ],
    [
      "Aquisição de equipamentos de videoconferência",
      "Câmara Municipal — Exemplo",
      "RS",
      "Caxias do Sul",
      96800,
      17,
      null,
    ],
    [
      "Manutenção preventiva de impressoras multifuncionais",
      "Instituto de Pesquisa — Exemplo",
      "SC",
      "Joinville",
      72300,
      14,
      null,
    ],
    [
      "Aquisição de notebooks para laboratórios de ensino",
      "Fundação de Ensino — Exemplo",
      "PR",
      "Londrina",
      345000,
      25,
      null,
    ],
    [
      "Fornecimento de mobiliário para escritórios",
      "Agência de Serviços — Exemplo",
      "PA",
      "Santarém",
      192400,
      11,
      null,
    ],
    [
      "Serviços de limpeza e conservação predial",
      "Fundação de Cultura — Exemplo",
      "RS",
      "Pelotas",
      563200,
      9,
      null,
    ],
    [
      "Licenciamento de plataforma de atendimento e suporte",
      "Instituto de Tecnologia — Exemplo",
      "SC",
      "Blumenau",
      215000,
      30,
      null,
    ],
    [
      "Aquisição de suprimentos de informática",
      "Secretaria de Educação — Exemplo",
      "PR",
      "Maringá",
      134500,
      7,
      null,
    ],
    [
      "Fornecimento de computadores e monitores corporativos",
      "Companhia Municipal — Exemplo",
      "PA",
      "Marabá",
      387000,
      -7,
      "WON",
    ],
    [
      "Reforma de espaços administrativos",
      "Fundação de Patrimônio — Exemplo",
      "SP",
      "Campinas",
      746000,
      19,
      null,
    ],
  ];
  let index = 0;
  for (const [title, agency, state, city, value, days, stage] of fixtures) {
    const id = randomUUID();
    const description = `DADO FICTÍCIO DE DEMONSTRAÇÃO. ${title}. Este exemplo permite testar análise, preparação e acompanhamento. Não corresponde a uma contratação pública real, não possui documentos oficiais nem permite envio de proposta.`;
    await db.query(
      `INSERT INTO opportunities(id,canonical_key,title,description,agency,state,city,modality,sphere,value,published_at,opens_at,closes_at,status,source_code,source_name,content_hash,demo_org_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'demo','Demonstração · dados fictícios',$15,$16)`,
      [
        id,
        `demo:${orgId}:${++index}`,
        title,
        description,
        agency,
        state,
        city,
        "Pregão - Eletrônico",
        index % 2 ? "Municipal" : "Estadual",
        value,
        day(-index),
        day(-index),
        day(Number(days)),
        Number(days) > 0
          ? "Divulgada no PNCP — EXEMPLO"
          : "Encerrada — EXEMPLO",
        digest(description),
        orgId,
      ],
    );
    if (stage) {
      const tid = randomUUID();
      await db.query(
        `INSERT INTO trackings(id,organization_id,opportunity_id,stage,owner_id,deadline,expected_value,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          tid,
          orgId,
          id,
          stage,
          userId,
          day(Math.max(1, Number(days) - 2)),
          value,
          "Registro fictício. Revise as exigências do edital e confirme documentos antes de participar.",
        ],
      );
      for (const [i, title] of [
        "Ler o edital e validar elegibilidade",
        "Conferir certidões e documentos",
        "Revisar composição de preços",
        "Preparar proposta para revisão",
      ].entries())
        await db.query(
          "INSERT INTO tasks(id,tracking_id,title,done,owner_id) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), tid, title, i === 0, userId],
        );
      await db.query(
        `INSERT INTO events(id,tracking_id,type,title,description,actor_id) VALUES($1,$2,'CREATED','Oportunidade adicionada ao radar','Exemplo de histórico operacional. Todos os dados desta empresa são fictícios.',$3)`,
        [randomUUID(), tid, userId],
      );
    }
  }
  await db.query(
    `INSERT INTO notifications(id,organization_id,title,description,url) VALUES($1,$2,$3,$4,'/app/radar')`,
    [
      randomUUID(),
      orgId,
      "Seu ambiente de demonstração está pronto",
      "Explore editais fictícios, mova etapas e conclua tarefas. Seus testes não afetam outras empresas.",
    ],
  );
  return { orgId, userId };
}

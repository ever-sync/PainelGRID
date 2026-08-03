import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FacebookLeadPayloadDto } from './facebook-lead-payload.dto';

describe('FacebookLeadPayloadDto', () => {
  it('aceita o formato e a data enviados pela campanha', async () => {
    const dto = plainToInstance(FacebookLeadPayloadDto, {
      lead_id: '1946096999403754',
      nome: 'Raphael',
      email: 'raphaelbetel3@gmail.com',
      telefone: '+5512981092776',
      preferencia_atendimento: 'whatsapp',
      formulario_id: '27515534804767924',
      anuncio_id: '120247888509270620',
      anuncio: 'Novo anúncio de Leads',
      campanha_id: '120247888509250620',
      campanha: 'teste',
      criado_em: '2026-07-14T02:25:25+0000',
      origem: 'facebook_lead_ads',
      todos_os_campos: { full_name: 'Raphael' },
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejeita lead sem identificador externo ou nome', async () => {
    const dto = plainToInstance(FacebookLeadPayloadDto, {
      lead_id: '   ',
      nome: '   ',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining(['lead_id', 'nome']));
  });

  it('rejeita payload sem o formulario usado para resolver o cliente', async () => {
    const dto = plainToInstance(FacebookLeadPayloadDto, {
      lead_id: '1946096999403754',
      nome: 'Raphael',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('formulario_id');
  });
});

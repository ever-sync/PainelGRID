import 'reflect-metadata';
import { AgentController } from '../agent/agent.controller';
import { IntegrationController } from './integration.controller';

describe('integration traffic throttling', () => {
  it.each([
    ['IntegrationController', IntegrationController],
    ['AgentController', AgentController],
  ])('allows controlled n8n bursts on %s', (_name, controller) => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', controller)).toBe(600);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', controller)).toBe(60_000);
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { resolveModelConfig } from '../../agents/eva/agent/model';

describe('resolveModelConfig', () => {
  it('applies the DeepSeek default when no model id is configured', () => {
    expect(resolveModelConfig({})).toEqual({
      apiKey: '',
      baseURL: '',
      modelName: 'deepseek-v4-flash',
    });
  });

  it('strips a provider prefix from the configured model id', () => {
    expect(
      resolveModelConfig({
        WHATSAPP_AGENT_LLM_API_KEY: 'key-1',
        WHATSAPP_AGENT_LLM_BASE_URL: 'https://llm.example.test/v1',
        WHATSAPP_AGENT_LLM_MODEL: 'opencode-go/deepseek-v4-flash',
      }).modelName,
    ).toBe('deepseek-v4-flash');
  });

  it('keeps a model id without a provider prefix intact', () => {
    expect(
      resolveModelConfig({ WHATSAPP_AGENT_LLM_MODEL: 'deepseek-v4-flash' })
        .modelName,
    ).toBe('deepseek-v4-flash');
  });

  it('reads env at call time, not at module load', () => {
    expect(resolveModelConfig({ WHATSAPP_AGENT_LLM_MODEL: 'model-a' }).modelName).toBe(
      'model-a',
    );
    expect(resolveModelConfig({ WHATSAPP_AGENT_LLM_MODEL: 'model-b' }).modelName).toBe(
      'model-b',
    );
  });
});

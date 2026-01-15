/**
 * OpenCode Configuration Utilities
 * 
 * Utilities for reading and writing OpenCode configuration files,
 * including API keys, models, and other settings.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logger } from '@/ui/logger';

/**
 * Result of reading OpenCode local configuration
 */
export interface OpenCodeLocalConfig {
  model: string | null;
  apiKey: string | null;
}

/**
 * Try to read OpenCode config (model and API key) from local OpenCode config
 * OpenCode stores config in ~/.config/opencode/config.json
 */
export function readOpenCodeLocalConfig(): OpenCodeLocalConfig {
  let model: string | null = null;
  let apiKey: string | null = null;
  
  // Try common OpenCode config locations
  const possiblePaths = [
    join(homedir(), '.config', 'opencode', 'config.json'),
    join(homedir(), '.opencode', 'config.json'),
  ];

  for (const configPath of possiblePaths) {
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        
        // Read model from config
        if (!model) {
          const foundModel = config.model || config.OPENCODE_MODEL;
          if (foundModel && typeof foundModel === 'string') {
            model = foundModel;
            logger.debug(`[OpenCode] Found model in ${configPath}: ${model}`);
          }
        }
        
        // Read API key if present (for API-based models)
        if (!apiKey) {
          const foundApiKey = config.apiKey || config.OPENCODE_API_KEY;
          if (foundApiKey && typeof foundApiKey === 'string') {
            apiKey = foundApiKey;
            logger.debug(`[OpenCode] Found API key in ${configPath}`);
          }
        }
      } catch (error) {
        logger.debug(`[OpenCode] Failed to read config from ${configPath}:`, error);
      }
    }
  }

  return { model, apiKey };
}

/**
 * Common OpenCode model options by provider
 * Note: OpenCode supports many more models than listed here
 */
export const COMMON_OPENCODE_MODELS: Record<string, string[]> = {
  claude: [
    'claude-sonnet-4',
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet',
    'claude-3-opus-20240229',
    'claude-3-opus',
    'claude-3-haiku-20240307',
    'claude-3-haiku',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-2024-11-20',
    'gpt-4o-mini',
    'gpt-4o-mini-2024-07-18',
    'gpt-4-turbo',
    'gpt-4-turbo-2024-04-09',
    'gpt-4',
    'gpt-4-0613',
  ],
  google: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro',
  ],
  opencode: [
    'opencode-sonnet-4',
  ],
};

/**
 * Default OpenCode model (uses OpenCode's default if config not set)
 */
export const DEFAULT_OPENCODE_MODEL = 'claude-sonnet-4';

/**
 * Validate if a model name is a recognized OpenCode model
 * 
 * @param model - The model name to validate
 * @returns True if the model is recognized
 */
export function isOpenCodeModelValid(model: string): boolean {
  const allModels = [
    ...COMMON_OPENCODE_MODELS.claude,
    ...COMMON_OPENCODE_MODELS.openai,
    ...COMMON_OPENCODE_MODELS.google,
    ...COMMON_OPENCODE_MODELS.opencode,
  ];
  
  return allModels.includes(model);
}

/**
 * Get a user-friendly list of all available models
 * 
 * @returns Formatted string listing all available models
 */
export function getAvailableOpenCodeModels(): string {
  const sections: string[] = [];
  
  sections.push('Claude:');
  COMMON_OPENCODE_MODELS.claude.forEach(m => sections.push(`  ${m}`));
  
  sections.push('\nOpenAI:');
  COMMON_OPENCODE_MODELS.openai.forEach(m => sections.push(`  ${m}`));
  
  sections.push('\nGoogle:');
  COMMON_OPENCODE_MODELS.google.forEach(m => sections.push(`  ${m}`));
  
  sections.push('\nOpenCode:');
  COMMON_OPENCODE_MODELS.opencode.forEach(m => sections.push(`  ${m}`));
  
  sections.push('\nNote: OpenCode supports many more models. Configure via /connect command in OpenCode TUI.');
  
  return sections.join('\n');
}

/**
 * Determine model to use based on priority:
 * 1. Explicit model parameter (if provided)
 * 2. Local config file
 * 3. Default model
 * 
 * @param explicitModel - Model explicitly provided (undefined = check sources, null = skip config)
 * @param localConfig - Local config result from readOpenCodeLocalConfig()
 * @returns The model string to use
 */
export function determineOpenCodeModel(
  explicitModel: string | null | undefined,
  localConfig: OpenCodeLocalConfig
): string {
  if (explicitModel !== undefined) {
    if (explicitModel === null) {
      // Explicitly null - use default, skip local config
      return DEFAULT_OPENCODE_MODEL;
    } else {
      // Model explicitly provided - use it
      return explicitModel;
    }
  } else {
    // No explicit model - check local config, then default
    const model = localConfig.model || DEFAULT_OPENCODE_MODEL;
    logger.debug(`[OpenCode] Selected model: ${model}`);
    return model;
  }
}

/**
 * Save model to OpenCode config file
 * 
 * @param model - The model name to save
 */
export function saveOpenCodeModelToConfig(model: string): void {
  try {
    const configDir = join(homedir(), '.config', 'opencode');
    const configPath = join(configDir, 'config.json');
    
    // Create directory if it doesn't exist
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    
    // Read existing config or create new one
    let config: any = {};
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch (error) {
        logger.debug(`[OpenCode] Failed to read existing config, creating new one`);
        config = {};
      }
    }
    
    // Update model in config
    config.model = model;
    
    // Write config back
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    logger.debug(`[OpenCode] Saved model "${model}" to ${configPath}`);
  } catch (error) {
    logger.debug(`[OpenCode] Failed to save model to config:`, error);
    throw error;
  }
}

/**
 * Get initial model value for UI display
 * Priority: local config > default
 * 
 * @returns The initial model string
 */
export function getInitialOpenCodeModel(): string {
  const localConfig = readOpenCodeLocalConfig();
  return localConfig.model || DEFAULT_OPENCODE_MODEL;
}

/**
 * Determine source of model for logging purposes
 * 
 * @param explicitModel - Model explicitly provided (undefined = check sources, null = skip config)
 * @param localConfig - Local config result from readOpenCodeLocalConfig()
 * @returns Source identifier: 'explicit' | 'local-config' | 'default'
 */
export function getOpenCodeModelSource(
  explicitModel: string | null | undefined,
  localConfig: OpenCodeLocalConfig
): 'explicit' | 'local-config' | 'default' {
  if (explicitModel !== undefined && explicitModel !== null) {
    return 'explicit';
  } else if (localConfig.model) {
    return 'local-config';
  } else {
    return 'default';
  }
}

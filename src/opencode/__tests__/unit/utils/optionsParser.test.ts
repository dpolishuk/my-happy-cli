import { describe, it, expect } from 'vitest';
import { parseOptionsFromText, formatOptionsXml } from '@/opencode/utils/optionsParser';

describe('OptionsParser', () => {
  it('should parse options from XML format', () => {
    const text = 'Here are options:\n<options>\n<option id="1">Yes</option>\n<option id="2">No</option>\n</options>';
    const options = parseOptionsFromText(text);

    expect(options).toEqual([
      { id: '1', name: 'Yes' },
      { id: '2', name: 'No' },
    ]);
  });

  it('should detect incomplete options', () => {
    const text = '<options>\n<option id="1">Yes</option>';
    const incomplete = parseOptionsFromText(text);

    expect(incomplete).toBeDefined();
  });
});

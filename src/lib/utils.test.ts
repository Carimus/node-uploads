import { trimPath } from './utils';

test('trimPath trims any sequence of whitespace and forward slashes from the ends of a string', () => {
    expect(trimPath('/test/123/abc/')).toBe('test/123/abc');
    expect(trimPath('   /test/123/abc/ ')).toBe('test/123/abc');
    expect(trimPath('/// /  /test/123/abc/ / /// ///')).toBe('test/123/abc');
    expect(trimPath('test/123/abc//')).toBe('test/123/abc');
    expect(trimPath('//test/123/abc ')).toBe('test/123/abc');
    expect(trimPath(' / ')).toBe('');
});

import {
    defaultSanitizeFilename,
    defaultGeneratePathForInstant,
} from './defaults';

test("defaultSanitizeFilename doesn't modify string with only basic allowed characters", () => {
    expect(defaultSanitizeFilename('foo_123.txt')).toBe('foo_123.txt');
});

test('defaultSanitizeFilename handles whitespace on the ends', () => {
    expect(defaultSanitizeFilename(' foo_123.txt  ')).toBe('foo_123.txt');
});

test('defaultSanitizeFilename replaces invalid characters', () => {
    expect(defaultSanitizeFilename('foo_1   2-3.txt')).toBe(
        'foo_1______2-3.txt',
    );
    expect(defaultSanitizeFilename('test*&^%$)¶§∞¶•∆µ.abc••')).toBe(
        'test__________________________.abc____',
    );
});

test('defaultGeneratePathForInstant generates paths in the format YYYY/MM/DD/HHmmssuuu-name.ext', () => {
    expect(
        defaultGeneratePathForInstant(
            new Date('2019-04-04T23:52:26.473Z'),
            'test.png',
        ),
    ).toBe('2019/04/04/235226473-test.png');
    expect(
        defaultGeneratePathForInstant(
            new Date('1992-12-04T05:02:00.000Z'),
            'test.png',
        ),
    ).toBe('1992/12/04/050200000-test.png');
});

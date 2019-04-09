import {
    defaultSanitizeFilename,
    defaultGeneratePathForInstant,
    defaultGeneratePath,
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
            [0, 473000000],
            'test.png',
        ),
    ).toBe('2019/04/04/235226-473000000-test.png');
    expect(
        defaultGeneratePathForInstant(
            new Date('1992-12-04T05:02:00.000Z'),
            [0, 0],
            'test.png',
        ),
    ).toBe('1992/12/04/050200-000000000-test.png');
});

test('defaultGeneratePath generates unique paths in the same tick', () => {
    expect(defaultGeneratePath('test.png')).not.toEqual(
        defaultGeneratePath('test.png'),
    );
    expect(defaultGeneratePath('test.png')).not.toEqual(
        defaultGeneratePath('test.png'),
    );
    expect(defaultGeneratePath('test.png')).not.toEqual(
        defaultGeneratePath('test.png'),
    );
});

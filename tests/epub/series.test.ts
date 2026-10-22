import { describe, expect, it } from 'vitest';
import { seriesFromTitle } from '../../src/epub/series';
import { contentOpf } from '../../src/epub/templates';
import type { Book } from '../../src/core/types';

describe('seriesFromTitle', () => {
  it.each([
    ['Shadow Slave Chapter 450', 'Shadow Slave', 450],
    ['Limitless Predation Chapter 10–11', 'Limitless Predation', 10],
    ['Limitless Predation Chapter 10 (vol. 2)', 'Limitless Predation', 10],
    ['One Piece - Capítulo 1100', 'One Piece', 1100],
    ['Solo Leveling Ch. 45', 'Solo Leveling', 45],
    ['Omniscient Reader: Episode 12', 'Omniscient Reader', 12],
    ['Blue Lock 250', 'Blue Lock', 250],
    ['Martial Peak Chapter 450.5', 'Martial Peak', 450.5],
  ])('%s', (title, name, position) => {
    expect(seriesFromTitle(title)).toEqual({ name, position });
  });

  it.each([['Como fazer pão'], ['Chapter 450'], ['2024'], ['']])('sem série: %s', (title) => {
    expect(seriesFromTitle(title)).toBeNull();
  });
});

const book = (over: Partial<Book> = {}): Book => ({
  title: 'Shadow Slave Chapter 450', author: 'site', language: 'en',
  identifier: 'urn:uuid:11111111-1111-4111-8111-111111111111',
  modified: new Date('2026-10-18T12:00:00Z'), chapters: [], images: [], ...over,
});

describe('contentOpf com série', () => {
  it('grava belongs-to-collection, tipo, posição e calibre', () => {
    const opf = contentOpf(book({ series: { name: 'Shadow & Slave', position: 450 } }));
    expect(opf).toContain('<meta property="belongs-to-collection" id="series">Shadow &amp; Slave</meta>');
    expect(opf).toContain('<meta refines="#series" property="collection-type">series</meta>');
    expect(opf).toContain('<meta refines="#series" property="group-position">450</meta>');
    expect(opf).toContain('<meta name="calibre:series" content="Shadow &amp; Slave"/>');
    expect(opf).toContain('<meta name="calibre:series_index" content="450"/>');
  });
  it('sem série não grava nada', () => {
    expect(contentOpf(book())).not.toContain('belongs-to-collection');
    expect(contentOpf(book())).not.toContain('calibre:series');
  });
});

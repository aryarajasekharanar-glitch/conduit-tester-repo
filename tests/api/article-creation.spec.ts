import { test, expect, request } from '@playwright/test';

const API_URL = process.env.BACKEND_URL || 'http://localhost:3000/api';

test.describe('Article creation API', () => {
  test('creates an article with a slug derived from the title, and rejects a duplicate title', async () => {
    const api = await request.newContext();

    const uniqueSuffix = Date.now();
    const registerRes = await api.post(`${API_URL}/users`, {
      data: {
        user: {
          username: `tester_${uniqueSuffix}`,
          email: `tester_${uniqueSuffix}@example.com`,
          password: 'password123',
        },
      },
    });
    expect(registerRes.status()).toBe(201);
    const { user } = await registerRes.json();
    expect(user.token).toBeTruthy();

    const authHeaders = { Authorization: `Token ${user.token}` };
    const title = `My Test Article ${uniqueSuffix}`;

    const createRes = await api.post(`${API_URL}/articles`, {
      headers: authHeaders,
      data: {
        article: {
          title,
          description: 'A short description',
          body: 'The body of the article',
          tagList: ['testing'],
        },
      },
    });
    expect(createRes.status()).toBe(201);
    const { article } = await createRes.json();

    // Note: the `slugify` library used here preserves original casing
    // (spaces -> hyphens only, no lowercasing) -- confirmed by running
    // this test against the live backend and inspecting the actual slug.
    const expectedSlugPrefix = title.trim().replace(/\s+/g, '-');
    expect(article.slug.startsWith(expectedSlugPrefix)).toBe(true);;
    expect(article.title).toBe(title);
    expect(article.author.username).toBe(`tester_${uniqueSuffix}`);

    const duplicateRes = await api.post(`${API_URL}/articles`, {
      headers: authHeaders,
      data: {
        article: {
          title,
          description: 'Different description',
          body: 'Different body',
        },
      },
    });
    expect(duplicateRes.status()).toBe(422);
    const duplicateBody = await duplicateRes.json();
    expect(duplicateBody.errors.title).toContain('must be unique');
  });

  test('rejects article creation with a missing title (422, field-specific error)', async () => {
    const api = await request.newContext();

    const uniqueSuffix = Date.now() + 1;
    const registerRes = await api.post(`${API_URL}/users`, {
      data: {
        user: {
          username: `tester2_${uniqueSuffix}`,
          email: `tester2_${uniqueSuffix}@example.com`,
          password: 'password123',
        },
      },
    });
    const { user } = await registerRes.json();

    const res = await api.post(`${API_URL}/articles`, {
      headers: { Authorization: `Token ${user.token}` },
      data: {
        article: {
          description: 'Has no title',
          body: 'Body text',
        },
      },
    });

    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.errors.title).toContain("can't be blank");
  });
});
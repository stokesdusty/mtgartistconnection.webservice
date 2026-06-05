import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface NewsArticle {
  title: string;
  content: string;
  summary: string;
}

async function generateWithRetry(prompt: string, maxRetries = 3): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error: any) {
      const isRateLimit =
        error.message?.includes('quota') ||
        error.message?.includes('429') ||
        error.message?.includes('RESOURCE_EXHAUSTED');

      if (isRateLimit) {
        // Log full error details to help distinguish RPM vs daily quota
        console.error('Quota/rate-limit error details:', JSON.stringify(error, null, 2));

        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 5000; // 5s, 10s, 20s
          console.log(`Rate limit hit, retrying in ${delayMs / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise((res) => setTimeout(res, delayMs));
          continue;
        }
      }

      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}

export async function generateNewsArticle(
  artistName: string,
  postContent: string,
  postUrl: string,
  platform: string
): Promise<NewsArticle> {
  const prompt = `You are a professional news writer for MTG Artist Connection, a website that covers Magic: The Gathering artists and their activities.

Given the following social media post from artist ${artistName} on ${platform}, generate a news article suitable for publication on the website.

Post content:
${postContent || 'No text content available - refer to the original post for visual content'}

Original post URL: ${postUrl}

Please generate:
1. A compelling news title (50-80 characters)
2. A brief summary (1-2 sentences, ~150 characters)
3. A full article (75-200 words) that:
   - Provides context about the artist and their work in the MTG community, if one is provided
   - Discusses what was shared in the post
   - Maintains an informative, but friendly, conversational tone
   - Includes a link to the original post for readers to view, if possible
   - Avoids speculation or unverified claims

Format your response as JSON with the following structure:
{
  "title": "Article title here",
  "summary": "Brief summary here",
  "content": "Full article content here"
}

Return ONLY the JSON, no other text.`;

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured in environment variables');
    }

    console.log('Generating article for artist:', artistName, 'platform:', platform);

    const text = await generateWithRetry(prompt);

    console.log('AI Response received, length:', text.length);
    console.log('AI Response preview:', text.substring(0, 200));

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Could not find JSON in response:', text);
      throw new Error('Failed to parse AI response - no JSON found');
    }

    const article = JSON.parse(jsonMatch[0]) as NewsArticle;

    if (!article.title || !article.content || !article.summary) {
      console.error('Missing required fields in article:', article);
      throw new Error('AI response missing required fields');
    }

    console.log('Article generated successfully');
    return article;
  } catch (error: any) {
    console.error('Error generating news article:', error);

    if (error.message?.includes('API_KEY') || error.message?.includes('API key')) {
      throw new Error('Gemini API key not configured. Please add GEMINI_API_KEY to your .env file');
    }
    if (error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('Gemini quota/rate limit exceeded. Free tier limits: 15 req/min and 1,500 req/day. Check usage at console.cloud.google.com → APIs & Services → Generative Language API → Metrics');
    }
    if (error.message?.includes('authentication') || error.message?.includes('401')) {
      throw new Error('Invalid Gemini API key. Please check your API key configuration');
    }

    throw new Error(`Failed to generate news article: ${error.message || 'Unknown error'}`);
  }
}

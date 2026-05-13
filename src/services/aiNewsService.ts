import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface NewsArticle {
  title: string;
  content: string;
  summary: string;
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
3. A full article (200-400 words) that:
   - Provides context about the artist and their work in the MTG community
   - Discusses what was shared in the post
   - Maintains a professional, informative tone
   - Includes a link to the original post for readers to view
   - Avoids speculation or unverified claims

Format your response as JSON with the following structure:
{
  "title": "Article title here",
  "summary": "Brief summary here",
  "content": "Full article content here"
}

Return ONLY the JSON, no other text.`;

  try {
    // Use Gemini 1.5 Flash (free tier model)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }

    const article = JSON.parse(jsonMatch[0]) as NewsArticle;

    // Validate the response
    if (!article.title || !article.content || !article.summary) {
      throw new Error('AI response missing required fields');
    }

    return article;
  } catch (error) {
    console.error('Error generating news article:', error);
    throw new Error('Failed to generate news article using AI');
  }
}

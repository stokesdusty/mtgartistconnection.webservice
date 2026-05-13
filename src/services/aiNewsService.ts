import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

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
}`;

  try {
    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
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

// server.js - Render.com proxy server
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const app = express();

// Get allowed origins from environment variable or use default
const clientOrigin = process.env.ALLOWED_ORIGIN || 'https://prompt-kitchen.netlify.app';

// Improved CORS configuration to handle both with and without trailing slash
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    // Handle both with and without trailing slash
    const normalizedOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    const normalizedAllowed = clientOrigin.endsWith('/') ? clientOrigin.slice(0, -1) : clientOrigin;
    
    if (normalizedOrigin === normalizedAllowed) {
      callback(null, true);
    } else {
      console.log(`Rejecting CORS request from: ${origin}, allowed: ${clientOrigin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(bodyParser.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.send('DeepSeek Proxy Server is running');
});

// Main endpoint to proxy requests to DeepSeek
app.post('/api/enhance-prompt', async (req, res) => {
  try {
    const { originalPrompt, techniques } = req.body;
    
    if (!originalPrompt || !originalPrompt.trim()) {
      return res.status(400).json({
        status: 'error',
        error: 'Prompt cannot be empty'
      });
    }
    
    // Get API key from environment
    const apiKey = process.env.DEEPSEEK_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({
        status: 'error',
        error: 'API key not configured on server'
      });
    }
    
    console.log('API key available, length:', apiKey.length);
    console.log('Processing prompt:', originalPrompt.substring(0, 50) + '...');
    
    // Only get active techniques
    const activeTechniques = techniques.filter(t => t.checked);
    
    // Create system message for DeepSeek
    const systemMessage = createSystemMessage(activeTechniques);
    
    // Make request to DeepSeek API
    console.log('Starting DeepSeek API call...');
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: originalPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    });
    
    console.log('DeepSeek API responded with status:', response.status);
    
    // Parse response
    const data = await response.json();
    
    if (!response.ok) {
      console.error('DeepSeek API error:', data);
      return res.status(response.status).json({
        status: 'error',
        error: data.error?.message || 'API Error'
      });
    }

    // Extract the enhanced prompt
    const enhancedPrompt = data.choices[0].message.content;
    console.log('Successfully got response, content length:', enhancedPrompt.length);
    
    // Return the result
    return res.status(200).json({
      status: 'completed',
      original: originalPrompt,
      enhanced: enhancedPrompt,
      // Generate improvements array based on active techniques
      improvements: activeTechniques
        .map(t => t.pastResult || `Applied ${t.name}`)
    });
    
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message || 'An unexpected error occurred'
    });
  }
});

// Helper function to create system message - UPDATED VERSION
function createSystemMessage(activeTechniques) {
  // Build instructions based on active techniques
  const techniqueInstructions = activeTechniques.map(technique => {
    const tagName = technique.name.replace(/\s/g, '').replace(/[^a-zA-Z0-9]/g, '');
    
    switch (technique.id) {
      case "addContext":
        return `Add relevant contextual information and background. Wrap this section in [${tagName}]...[/${tagName}] tags.`;
      case "increaseSpecificity":
        return `Make the prompt more specific and targeted. Wrap this section in [${tagName}]...[/${tagName}] tags.`;
      case "clarifyLanguage":
        return `Use clearer and more precise language. Wrap this section in [${tagName}]...[/${tagName}] tags.`;
      case "transformToOpenEnded":
        return `Transform closed questions into more open-ended ones. Wrap this section in [${tagName}]...[/${tagName}] tags.`;
      case "ensureNeutrality":
        return `Remove biases and make the prompt more neutral. Wrap this section in [${tagName}]...[/${tagName}] tags.`;
      case "addStructure":
        return `Add structure using a variety of formats (bullet points, headers, or short numbered sections). Wrap the structured section in [${tagName}]...[/${tagName}] tags.`;
      case "explainLogic":
        return `Add elements that demonstrate logical reasoning. Wrap this section in [${tagName}]...[/${tagName}] tags.`;
      case "setConstraints":
        return `Set appropriate constraints or boundaries. Wrap this section in [${tagName}]...[/${tagName}] tags.`;
      case "rolePrompting":
        return `Add appropriate expert role framing. Wrap this section in [${tagName}]...[/${tagName}] tags.`;
      case "focusSolutions":
        return `Focus on practical solutions and actionable approaches. Wrap this section in [${tagName}]...[/${tagName}] tags.`;
      case "beCreative":
        return `Add creative or imaginative elements to the prompt. Wrap this section in [${tagName}]...[/${tagName}] tags.`;
      case "summarizePoints":
        return `Request key points to be summarized or highlighted. Wrap this section in [${tagName}]...[/${tagName}] tags.`;
      default:
        return "";
    }
  }).filter(Boolean);

  // Get only the active technique names for warning
  const activeTechniqueNames = activeTechniques.map(t => t.name.replace(/\s/g, '').replace(/[^a-zA-Z0-9]/g, '')).join(", ");

  return `
You are an AI Prompt Improvement Expert. Your job is to REWRITE and ENHANCE the user's prompt to make it more effective for getting better responses from AI assistants. DO NOT answer the prompt itself.

IMPORTANT: You are not supposed to answer the user's question. Instead, rewrite their prompt to make it better.

SELECTED TECHNIQUES: ${activeTechniqueNames}
You should ONLY apply these selected techniques to improve the prompt. DO NOT use techniques that aren't listed above.

Apply these enhancement techniques to the user's prompt and structure your response by marking the sections with tags as requested:
${techniqueInstructions.map(inst => `- ${inst}`).join('\n')}

IMPORTANT FORMATTING INSTRUCTIONS:
- When adding structure, vary your formatting approach. Use bullet points (•), dashes (-), or headers instead of always using numbered lists.
- For complex topics, consider using bold headers (**Section Title**) instead of numbers.
- The prompt should feel cohesive, not like a mechanical list of separate points.
- **Crucially, for each applied technique, please wrap the corresponding part of the enhanced prompt in the requested tags.**
- DO NOT use techniques or tags that weren't specified in the SELECTED TECHNIQUES list above.
- There is no need to follow any predefined template or structure.
- Each prompt should be unique and specifically tailored to the user's request.

INSTRUCTION: Respond ONLY with the enhanced prompt. DO NOT answer the original question.
`;
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
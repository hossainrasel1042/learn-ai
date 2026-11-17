

import {
  Annotation,
  StateGraph,
  END,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from '@langchain/core/messages';

import { settings } from '../config/settings.js';
import { logger } from '../utils/logger.js';
import { shouldTryFallbackModel, modelCandidates } from '../services/geminiService.js';

import {
  search_chat_history,
  course_materials_search as _courseMaterialsSearchTool,
  generate_learning_content,
  generate_validated_code,
  wikipedia_search,
  duckduckgo_search,
  setSearchRuntimeContext,
  clearSearchRuntimeContext,
} from './tools/index.js';
import { StreamEventType, MessageRole } from './schemas.js';






export const AgentState = Annotation.Root({
  messages: Annotation({
    reducer: (current, update) => {
      if (!update) return current;

      const list = Array.isArray(update) ? update : [update];
      return [...(current || []), ...list];
    },
    default: () => [],
  }),
  userId: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),
  chatId: Annotation({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),
});






function _dictToMessage(m) {
  const role = m.role || m.role_;
  const content = m.content;
  switch (role) {
    case MessageRole.SYSTEM:
    case 'system':
      return new SystemMessage(content);
    case MessageRole.USER:
    case 'user':
      return new HumanMessage(content);
    case MessageRole.ASSISTANT:
    case 'assistant':
      return new AIMessage(content);
    case 'tool':
      return new ToolMessage({
        content: m.content,
        tool_call_id: m.toolCallId || m.tool_call_id,
      });
    default:

      return m;
  }
}






function _modelCandidates() {
  return modelCandidates(settings.GEMINI_MODEL);
}





export class ChatAgent {
  constructor() {







    this.modelCandidates = _modelCandidates();

    this.tools = [
      search_chat_history(),
      _courseMaterialsSearchTool(),
      wikipedia_search(),
      duckduckgo_search(),
      generate_validated_code(),
      generate_learning_content(),
    ];

    this._modelIndex = 0;
    this._llm = null;
    this._llmWithTools = null;
    this._graph = null;
    this._useModel(0);
  }


  _useModel(index) {
    this._modelIndex = index;
    const model = this.modelCandidates[index];
    this.llm = new ChatGoogleGenerativeAI({
      model,
      apiKey: settings.GEMINI_API_KEY,
      temperature: 0.7,










      maxRetries: 0,
    });
    this.llmWithTools = this.llm.bindTools(this.tools);
    this.graph = this._buildGraph();
    logger.info(`ChatAgent: using model ${model}`);
  }


  _useFallbackModel() {
    if (this._modelIndex + 1 >= this.modelCandidates.length) return false;
    this._useModel(this._modelIndex + 1);
    return true;
  }


  _buildGraph() {
    const graph = new StateGraph(AgentState);

    graph.addNode('agent', this._agentNode.bind(this));
    graph.addNode('tools', new ToolNode(this.tools));

    graph.setEntryPoint('agent');
    graph.addConditionalEdges('agent', this._shouldContinue.bind(this), {
      continue: 'tools',
      end: END,
    });
    graph.addEdge('tools', 'agent');

    return graph.compile();
  }


  async _agentNode(state) {
    const messages = state.messages || [];
    try {
      const response = await this.llmWithTools.invoke(messages);
      return { messages: [response] };
    } catch (e) {
      if (shouldTryFallbackModel(e) && this._useFallbackModel()) {
        logger.warn(
          `ChatAgent: model ${this.modelCandidates[this._modelIndex - 1]} is out of quota ` +
            `(${e.message || e}) — retrying with ${this.modelCandidates[this._modelIndex]}`
        );
        const response = await this.llmWithTools.invoke(messages);
        return { messages: [response] };
      }
      throw e;
    }
  }


  _shouldContinue(state) {
    const messages = state.messages || [];
    const last = messages[messages.length - 1];
    if (!last) return 'end';


    const toolCalls = last.tool_calls || last.toolCalls;
    if (toolCalls && toolCalls.length > 0) return 'continue';
    return 'end';
  }


  async invoke({ userId, chatId, messages, systemPrompt }) {
    const lcMessages = [];

    if (systemPrompt) {
      lcMessages.push(new SystemMessage(systemPrompt));
    }
    for (const m of messages) {
      lcMessages.push(_dictToMessage(m));
    }

    const initialState = {
      messages: lcMessages,
      userId,
      chatId,
    };





    setSearchRuntimeContext({ userId, chatId });




    const controller = new AbortController();
    const timeoutMs = 60_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let result;
      while (true) {
        try {
          result = await this.graph.invoke(initialState, {
            recursionLimit: 25,
            signal: controller.signal,





            configurable: { userId, chatId },
          });
          break;
        } catch (e) {



          if (shouldTryFallbackModel(e) && this._useFallbackModel()) {
            logger.warn(
              `ChatAgent: model ${this.modelCandidates[this._modelIndex - 1]} is out of quota ` +
                `(${e.message || e}) — retrying with ${this.modelCandidates[this._modelIndex]}`
            );
            continue;
          }
          throw e;
        }
      }
      const last = result.messages?.[result.messages.length - 1];
      return last?.content || '';
    } catch (e) {
      if (controller.signal.aborted) {
        logger.warn(`ChatAgent.invoke aborted after ${timeoutMs}ms`);
        throw new Error('Chat agent timed out');
      }
      throw e;
    } finally {
      clearTimeout(timer);
      clearSearchRuntimeContext();
    }
  }


  async *stream({ userId, chatId, messages, systemPrompt }) {
    yield { event: StreamEventType.START, data: '' };

    const lcMessages = [];
    if (systemPrompt) {
      lcMessages.push(new SystemMessage(systemPrompt));
    }
    for (const m of messages) {
      lcMessages.push(_dictToMessage(m));
    }

    const initialState = {
      messages: lcMessages,
      userId,
      chatId,
    };



    setSearchRuntimeContext({ userId, chatId });

    try {










      let emitted = false;

      while (true) {
        try {
          const stream = await this.graph.streamEvents(initialState, {
            version: 'v2',


            configurable: { userId, chatId },
          });

          for await (const ev of stream) {

            if (ev.event === 'on_custom_event') {
              if (ev.name === 'progress_update') {
                yield {
                  event: 'thinking',
                  data: ev.data?.message || JSON.stringify(ev.data || {}),
                };
              }
              continue;
            }


            if (
              ev.event === 'on_chat_model_stream' ||
              ev.event === 'on_llm_stream'
            ) {
              const chunk = ev.data?.chunk;
              const token =
                chunk?.content ??
                (typeof chunk?.text === 'function' ? chunk.text() : chunk?.text);
              if (token) {
                emitted = true;
                yield { event: StreamEventType.TOKEN, data: token };
              }
              continue;
            }


            if (ev.event === 'on_tool_start') {
              yield {
                event: StreamEventType.TOOL_CALL,
                data: {
                  name: ev.name || ev.data?.tool || 'unknown',
                  input: ev.data?.input || {},
                },
              };
              continue;
            }


            if (ev.event === 'on_tool_end') {
              yield {
                event: StreamEventType.TOOL_RESULT,
                data: {
                  name: ev.name || ev.data?.tool || 'unknown',
                  output:
                    typeof ev.data?.output === 'string'
                      ? ev.data.output
                      : JSON.stringify(ev.data?.output ?? ''),
                },
              };
              continue;
            }


            if (ev.event === 'on_chain_end' && ev.name === 'LangGraph') {
              const out = ev.data?.output;
              const lastMsg = out?.messages?.[out.messages.length - 1];
              yield {
                event: StreamEventType.END,
                data: lastMsg?.content || '',
              };
            }
          }
          break;
        } catch (e) {
          if (!emitted && shouldTryFallbackModel(e) && this._useFallbackModel()) {
            logger.warn(
              `ChatAgent: model ${this.modelCandidates[this._modelIndex - 1]} is out of quota ` +
                `(${e.message || e}) — retrying the stream with ${this.modelCandidates[this._modelIndex]}`
            );
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      logger.error(`ChatAgent.stream failed: ${e.message || e}`);
      yield {
        event: StreamEventType.ERROR,
        data: e?.message || String(e),
      };
    } finally {
      clearSearchRuntimeContext();
    }
  }
}





let _chatAgent = null;


export const getChatAgent = () => {
  if (!_chatAgent) {
    _chatAgent = new ChatAgent();
  }
  return _chatAgent;
};

export { _chatAgent };

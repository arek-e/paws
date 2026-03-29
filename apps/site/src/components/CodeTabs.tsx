import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const tsCode = `<span class="text-blue-400">import</span> { <span class="text-purple-400">createClient</span> } <span class="text-blue-400">from</span> <span class="text-emerald-400">'@paws/sdk'</span>;

<span class="text-blue-400">const</span> paws <span class="text-zinc-500">=</span> <span class="text-purple-400">createClient</span>({ <span class="text-amber-400">baseUrl</span>: <span class="text-emerald-400">'https://your-server:4000'</span>, <span class="text-amber-400">apiKey</span>: <span class="text-emerald-400">'paws-...'</span> });
<span class="text-blue-400">const</span> session <span class="text-zinc-500">=</span> <span class="text-blue-400">await</span> paws.sessions.<span class="text-purple-400">create</span>({
  <span class="text-amber-400">snapshot</span>: <span class="text-emerald-400">'claude-code'</span>,
  <span class="text-amber-400">workload</span>: { <span class="text-amber-400">type</span>: <span class="text-emerald-400">'script'</span>, <span class="text-amber-400">script</span>: <span class="text-emerald-400">'Review this PR and post comments'</span>, <span class="text-amber-400">env</span>: {}  },
});
console.<span class="text-purple-400">log</span>(session.value.sessionId); <span class="text-zinc-600">// → "a1b2c3..."</span>`;

const pyCode = `<span class="text-blue-400">from</span> paws <span class="text-blue-400">import</span> <span class="text-purple-400">PawsClient</span>

paws <span class="text-zinc-500">=</span> <span class="text-purple-400">PawsClient</span>(<span class="text-amber-400">base_url</span><span class="text-zinc-500">=</span><span class="text-emerald-400">"https://your-server:4000"</span>, <span class="text-amber-400">api_key</span><span class="text-zinc-500">=</span><span class="text-emerald-400">"paws-..."</span>)
session <span class="text-zinc-500">=</span> paws.sessions.<span class="text-purple-400">create</span>(
    <span class="text-amber-400">snapshot</span><span class="text-zinc-500">=</span><span class="text-emerald-400">"claude-code"</span>,
    <span class="text-amber-400">workload</span><span class="text-zinc-500">=</span>{<span class="text-emerald-400">"type"</span>: <span class="text-emerald-400">"script"</span>, <span class="text-emerald-400">"script"</span>: <span class="text-emerald-400">"Review this PR and post comments"</span>, <span class="text-emerald-400">"env"</span>: {}},
)
<span class="text-purple-400">print</span>(session.session_id)  <span class="text-zinc-600"># → "a1b2c3..."</span>`;

const cliCode = `<span class="text-emerald-400">$</span> paws sessions create \\
    <span class="text-zinc-500">--snapshot</span> claude-code \\
    <span class="text-zinc-500">--script</span> <span class="text-emerald-400">"Review this PR and post comments"</span>
<span class="text-zinc-600">Session created: a1b2c3...</span>
<span class="text-zinc-600">Status: running</span>`;

export default function CodeTabs() {
  return (
    <Tabs defaultValue="ts">
      <TabsList
        variant="line"
        className="border-b-2 border-zinc-800 mb-6 h-auto p-0 bg-transparent"
      >
        <TabsTrigger
          value="ts"
          className="px-6 py-3 text-sm font-medium text-zinc-500 data-active:text-emerald-400 border-b-2 border-transparent data-active:border-emerald-400 rounded-none -mb-0.5 bg-transparent data-active:bg-transparent hover:text-zinc-300"
        >
          TypeScript
        </TabsTrigger>
        <TabsTrigger
          value="py"
          className="px-6 py-3 text-sm font-medium text-zinc-500 data-active:text-emerald-400 border-b-2 border-transparent data-active:border-emerald-400 rounded-none -mb-0.5 bg-transparent data-active:bg-transparent hover:text-zinc-300"
        >
          Python
        </TabsTrigger>
        <TabsTrigger
          value="cli"
          className="px-6 py-3 text-sm font-medium text-zinc-500 data-active:text-emerald-400 border-b-2 border-transparent data-active:border-emerald-400 rounded-none -mb-0.5 bg-transparent data-active:bg-transparent hover:text-zinc-300"
        >
          CLI
        </TabsTrigger>
      </TabsList>

      <TabsContent value="ts">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 overflow-x-auto">
          <pre
            className="font-mono text-[0.8125rem] leading-[1.7] text-zinc-300 m-0"
            dangerouslySetInnerHTML={{ __html: tsCode }}
          />
        </div>
      </TabsContent>

      <TabsContent value="py">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 overflow-x-auto">
          <pre
            className="font-mono text-[0.8125rem] leading-[1.7] text-zinc-300 m-0"
            dangerouslySetInnerHTML={{ __html: pyCode }}
          />
        </div>
      </TabsContent>

      <TabsContent value="cli">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 overflow-x-auto">
          <pre
            className="font-mono text-[0.8125rem] leading-[1.7] text-zinc-300 m-0"
            dangerouslySetInnerHTML={{ __html: cliCode }}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}

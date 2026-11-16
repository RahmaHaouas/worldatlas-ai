# Demo video script — under 3 minutes (target 2:45)

Record your screen at 1080p (OBS Studio is free). Use no copyrighted music. Speak slowly. Each block below is about 20–30 s.
Before recording: deploy, run the Step Functions sync once, and open the CloudFront URL. Ask the first AI question once beforehand to warm the Lambdas.

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:15 | App on globe view, slowly rotate | "This is WorldAtlas AI, a serverless atlas of what makes every country unique, with every claim sourced and checked against real trade data." |
| 0:15–0:40 | Click **Tunisia** → panel opens; scroll the cards; point at a *Verified* UNESCO card and the RCA line on the olive oil card | "Each of the 217 countries has a profile from the World Bank. Specialties are typed: cultural, production, export. Each one shows its source and year. Olive oil is a curated export claim, and our pipeline checks it automatically against UN Comtrade. Here is the computed RCA and the verdict." |
| 0:40–1:00 | Mode bar → **Culture**, then **Resources**: the map recolors | "Eight visualization modes recolor the map by category without leaving it." |
| 1:00–1:25 | **Specialties** → search "olive oil" → map highlights; show the exporters chart; tick Tunisia + Spain → **Compare selected** | "Search works both ways: specialty to countries. Here are the exporters, world shares and RCA. I select Tunisia and Spain and compare them. Note the flag when reporting years differ." |
| 1:25–1:45 | **Global Trade** → product *Cocoa beans*: the map is colored by RCA; show the evolution chart | "Global Trade computes the Revealed Comparative Advantage for 23 products and several years, directly from UN Comtrade." |
| 1:45–2:10 | **AI Assistant** → "Which countries export the most cocoa?" → answer with [1][2] citations; countries light up; click a related question | "The assistant runs on Amazon Bedrock with retrieval-augmented generation. It answers only from retrieved records, cites them, and the countries come from the data, not the model." |
| 2:10–2:40 | Show `docs/architecture.png`, then the AWS console: **Step Functions** graph of a successful execution, the DynamoDB table, the EventBridge schedule | "Architecture: CloudFront and S3 serve the app. API Gateway calls five Lambda services reading one DynamoDB table. A weekly EventBridge schedule runs a Step Functions workflow: World Bank, Natural Earth, then a Map over 48 Comtrade jobs, RCA computation, and the RAG index in S3." |
| 2:40–2:50 | Back to the globe | "One SAM template, no servers, no pipelines, and it scales to zero when idle. Thanks for watching!" |

Upload to YouTube as **Public** (or Unlisted only if the rules allow it; the rules say *publicly visible*, so choose **Public**). Paste the link into the **demo** field of your Builder Center project.

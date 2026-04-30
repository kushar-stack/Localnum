import { ImageResponse } from "@vercel/og";

export const config = {
  runtime: "edge",
};

export default function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const title = searchParams.get("title") || "Your Daily Pulse on Global News";
    const b1 = searchParams.get("b1") || "";
    const b2 = searchParams.get("b2") || "";
    const b3 = searchParams.get("b3") || "";
    
    const bullets = [b1, b2, b3].filter(b => b.length > 0);

    return new ImageResponse(
      {
        type: "div",
        props: {
          style: {
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#f2ede4",
            padding: "80px",
            fontFamily: "sans-serif",
          },
          children: [
            {
              type: "div",
              props: {
                style: { 
                  display: "flex", 
                  color: "#1a5c44", 
                  fontSize: 28, 
                  fontWeight: 900, 
                  marginBottom: 40,
                  letterSpacing: "0.1em"
                },
                children: "BUSY BRIEF",
              },
            },
            {
              type: "div",
              props: {
                style: { 
                  fontSize: 72, 
                  fontWeight: 800, 
                  marginBottom: 60, 
                  lineHeight: 1.1, 
                  color: "#130f0a" 
                },
                children: title,
              },
            },
            {
              type: "div",
              props: {
                style: { display: "flex", flexDirection: "column", gap: 32 },
                children: bullets.map(b => ({
                  type: "div",
                  props: {
                    style: { display: "flex", alignItems: "center", fontSize: 34, color: "#3d3529" },
                    children: [
                      {
                        type: "div",
                        props: {
                          style: { 
                            width: 14, 
                            height: 14, 
                            borderRadius: "50%", 
                            backgroundColor: "#1a5c44", 
                            marginRight: 24,
                            flexShrink: 0
                          },
                        },
                      },
                      {
                        type: "div",
                        props: {
                          style: { flex: 1 },
                          children: b.length > 80 ? b.slice(0, 77) + "..." : b
                        }
                      }
                    ],
                  },
                })),
              },
            },
            {
              type: "div",
              props: {
                style: {
                  position: "absolute",
                  bottom: 40,
                  right: 80,
                  fontSize: 20,
                  color: "#7a6e61",
                  fontStyle: "italic"
                },
                children: "Read the full brief at localnum.vercel.app"
              }
            }
          ],
        },
      },
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e) {
    console.error(e);
    return new Response(`Failed to generate image`, { status: 500 });
  }
}

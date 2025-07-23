// File: utils/modelSelector.ts
export function getModelsByFeature(feature: string): { name: string; type: 'json' | 'text'; temperature: number }[] {
  const baseTemp = 0.41;

  if (feature === 'rephrase') {
    return [
      { name: "Qwen/Qwen3-235B-A22B-fp8-tput", type: "json", temperature: baseTemp },
      { name: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", type: "json", temperature: baseTemp },
      { name: "Qwen/Qwen1.5-72B-Chat", type: "text", temperature: baseTemp },
      { name: "google/gemma-3n-E4B-it", type: "text", temperature: baseTemp }
    ];
  } else if (feature === 'expand') {
    return [
      { name: "Qwen/Qwen3-235B-A22B-fp8-tput", type: "text", temperature: 0.66  },
      { name: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", type: "text", temperature: 0.66 },
      { name: "Qwen/Qwen1.5-72B-Chat", type: "text", temperature: 0.66  },
      { name: "google/gemma-3n-E4B-it", type: "text", temperature: 0.66  }
    ];
  } else if (feature === 'shorten') {   
    return [
      { name: "Qwen/Qwen3-235B-A22B-fp8-tput", type: "json", temperature: 0.66  },
      { name: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", type: "json", temperature: 0.66  },
      { name: "Qwen/Qwen1.5-72B-Chat", type: "text", temperature: 0.66  },
      { name: "google/gemma-3n-E4B-it", type: "text", temperature: 0.66  }
    ];
  }


  return [
    { name: "Qwen/Qwen1.5-72B-Chat", type: "text", temperature: baseTemp },
    { name: "google/gemma-3n-E4B-it", type: "text", temperature: baseTemp }
  ];
}

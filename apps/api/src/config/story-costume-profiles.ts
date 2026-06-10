/**
 * 故事角色妆造描述库
 *
 * 为什么需要这个？
 * AI 生成角色时需要知道角色在故事中的服装/造型/身份。
 * 比如"愚公移山"，角色是古代中国老农，应该穿粗布短褐、戴斗笠、扛锄头。
 * 如果 prompt 只说"dressed as a character from 愚公移山"，AI 不知道要画什么。
 *
 * 结构：
 * - title: 故事标题
 * - era: 时代背景（用于 prompt 中的 world description）
 * - roles: 角色妆造数组
 *   - name: 角色名称/类型
 *   - appearance: 外貌描述
 *   - costume: 服装描述
 *   - prop: 道具/配饰
 *   - mood: 整体气质
 */

// ============================================================
// 预设模板妆造（硬编码，无需 LLM 调用）
// ============================================================

export const STORY_COSTUME_PROFILES: Record<string, StoryCostumeProfile> = {
  // 经典西方童话
  'little-red-riding-hood': {
    title: '小红帽',
    era: 'European medieval fairy tale setting',
    roles: [
      {
        name: '小红帽',
        appearance: 'A sweet young girl, 8-10 years old, rosy cheeks, innocent big eyes, blonde or brown hair in braids',
        costume: 'wearing a classic red hooded cloak/cape with a pointed hood covering her head and shoulders, simple peasant dress underneath',
        prop: 'carrying a wicker basket covered with a checkered cloth',
        mood: 'cheerful, curious, gentle',
      },
      {
        name: '狼外婆',
        appearance: 'A cunning anthropomorphic wolf with a grandmother disguise, sly eyes',
        costume: 'disguised as an old woman in a nightgown and shawl, but with wolf ears and tail subtly visible',
        prop: 'grandmother clothes and a knitting basket',
        mood: 'deceptive, menacing underneath',
      },
    ],
    globalNote: 'Classic European fairy tale atmosphere, warm but slightly dark forest setting',
  },

  'snow-white': {
    title: '白雪公主',
    era: 'European fairy tale kingdom setting',
    roles: [
      {
        name: '白雪公主',
        appearance: 'A beautiful young princess, extremely fair porcelain skin, rosy lips, long black hair like a waterfall',
        costume: 'elegant royal ball gown in ice blue or pure white, pearl tiara on her head, puff sleeves',
        prop: 'golden apple or a ribbon in her hair',
        mood: 'pure, kind, delicate',
      },
      {
        name: '邪恶皇后',
        appearance: 'An aging but still beautiful queen, sharp cold eyes, high cheekbones',
        costume: 'rich dark velvet gown with ermine trim, ornate crown, black or deep purple cape',
        prop: 'magic mirror or a poison comb',
        mood: 'arrogant, jealous, cold',
      },
      {
        name: '七个小矮人',
        appearance: 'Seven small chubby dwarfs, each with a distinct beard style, big noses, kind eyes',
        costume: 'colorful miner outfits - each wearing a different color (blue, green, red, yellow, purple, orange, pink) work tunic with suspenders, matching colored hats',
        prop: 'pickaxe, lantern, wheelbarrow, mining tools',
        mood: 'cheerful, helpful, loyal',
      },
    ],
    globalNote: 'Rich royal palace contrast with cozy forest cottage, fairy tale magic atmosphere',
  },

  'three-little-pigs': {
    title: '三只小猪',
    era: 'Quaint European countryside fairy tale setting',
    roles: [
      {
        name: '猪老大',
        appearance: 'A cheerful pig with a round belly, pink skin, happy expression',
        costume: 'casual farm clothes - simple shirt and pants in dull brown, no hat',
        prop: 'carrying straw bundle',
        mood: 'lazy but good-natured',
      },
      {
        name: '猪老二',
        appearance: 'A slightly smarter pig, alert eyes, leaner build than the first pig',
        costume: 'work clothes in tan/beige - sturdy shirt and pants, a flat cap',
        prop: 'carrying wood planks and a hammer',
        mood: 'careless but more responsible than the first pig',
      },
      {
        name: '猪小弟',
        appearance: 'The smartest and most hardworking pig, determined expression, neat appearance',
        costume: 'cleanest clothes - neat shirt and pants in gray, a small beret or cap, rolled-up sleeves',
        prop: 'holding a brick trowel and mortar bucket',
        mood: 'clever, diligent, wise',
      },
      {
        name: '大灰狼',
        appearance: 'A big bad wolf, sharp pointed ears, fierce eyes, sharp teeth showing, gray fur',
        costume: 'no disguise needed, intimidating appearance with torn work clothes he stole from the pigs',
        prop: 'giant black hat to look bigger, carrying a large fan or blower',
        mood: 'ruthless, cunning, greedy',
      },
    ],
    globalNote: 'Whimsical cartoon farm atmosphere, each pig in different stage of construction',
  },

  'cinderella': {
    title: '灰姑娘',
    era: 'European medieval royal ball setting',
    roles: [
      {
        name: '灰姑娘',
        appearance: 'A kind girl with warm eyes, gentle smile, neat but worn appearance; when transformed, becomes breathtakingly beautiful with a glowing aura',
        costume: 'as servant: torn gray dress, hair tied back; as princess: magnificent ball gown in sky blue or silver, sparkling glass slippers, delicate elbow-length gloves',
        prop: 'as servant: broom and dustpan; as princess: magical glass slipper',
        mood: 'hopeful, kind-hearted, graceful',
      },
      {
        name: '继母',
        appearance: 'A stern stepmother, sharp features, cold expression, well-dressed',
        costume: 'dark elegant gown in black or deep green, lace collar, hair pinned up with jeweled pins',
        prop: 'holding a fan or riding crop',
        mood: 'cruel, vain, selfish',
      },
      {
        name: '仙女教母',
        appearance: 'An elegant fairy godmother, kind wise face, glowing aura, magical particles floating around',
        costume: 'flowing gown in white and pale blue with star patterns, magical wings, tiara with moon and stars',
        prop: 'wand with a star tip that sparkles with magic',
        mood: 'magical, benevolent, mysterious',
      },
      {
        name: '王子',
        appearance: 'A handsome young prince, confident posture, kind eyes, royal bearing',
        costume: 'royal military-inspired coat in red and gold, white pants, ceremonial sword, royal crown',
        prop: 'holding the glass slipper',
        mood: 'romantic, sincere, determined',
      },
    ],
    globalNote: 'Contrast between the shabby kitchen and magnificent ballroom, fairy tale magic sparkle',
  },

  'sleeping-beauty': {
    title: '睡美人',
    era: 'Medieval European enchanted kingdom setting',
    roles: [
      {
        name: '睡美人/奥萝拉公主',
        appearance: 'A stunningly beautiful sleeping princess, peaceful expression, extra long eyelashes, graceful sleeping pose',
        costume: 'elegant white or pale pink ball gown, delicate lace details, her long golden hair spread on a velvet pillow, a rose crown',
        prop: 'surrounded by magical roses and floating sparkles',
        mood: 'dreamlike, serene, enchanting',
      },
      {
        name: '黑仙女',
        appearance: 'A dark fairy with a twisted evil smile, sharp angular features, glowing dark aura',
        costume: 'flowing black and dark purple gown that seems to absorb light, cobweb patterns, skull or bat motifs',
        prop: 'spindles, dark magic wand, or black ravens',
        mood: 'malicious, vengeful, dark',
      },
      {
        name: '王子',
        appearance: 'A brave young prince in shining armor, determined expression',
        costume: 'silver knight armor with a red cape, crown of laurels, sword at his side',
        prop: 'sword, red cape flowing behind him',
        mood: 'brave, heroic, romantic',
      },
    ],
    globalNote: 'Dark enchanted forest setting, magic curse atmosphere, contrast between beautiful princess and thorny vines',
  },

  'ugly-duckling': {
    title: '丑小鸭',
    era: 'Serene countryside farm and pond setting',
    roles: [
      {
        name: '丑小鸭/天鹅',
        appearance: 'As cygnet: awkward gray fluffy bird, slightly larger than siblings, uncertain expression; As swan: magnificent white swan with graceful long neck, elegant curved wings, orange beak, beautiful and serene',
        costume: 'feathers: downy gray-brown as baby, brilliant white with black wingtips as adult swan',
        prop: 'pond, water lilies, reeds',
        mood: 'misty, lonely as baby; glorious, peaceful as swan',
      },
      {
        name: '鸭妈妈',
        appearance: 'A warm mother duck, gentle eyes, plump rounded shape',
        costume: 'typical yellow duck appearance, motherly aura, wearing a small apron',
        prop: 'leading ducklings in a line',
        mood: 'caring, protective, patient',
      },
    ],
    globalNote: 'Pastoral peaceful farm pond atmosphere, transformation journey, emotional contrast',
  },

  'pinocchio': {
    title: '匹诺曹',
    era: 'Italian traditional village fairy tale setting',
    roles: [
      {
        name: '匹诺曹',
        appearance: 'A wooden puppet boy with visible carved wooden joints, expressive large eyes, button nose, turned-up wooden nose, cute gap-toothed smile when happy',
        costume: 'colorful jester costume: blue and yellow patched jacket, red patched pants, pointed hat with a bell, no shoes (wooden feet are bare)',
        prop: 'Geppetto gave him a string puppet, wooden school bag or books',
        mood: 'naughty but good-hearted, mischievous, honest when caught lying',
      },
      {
        name: '杰佩托',
        appearance: 'An elderly kind carpenter, round spectacles, warm grandfatherly appearance',
        costume: 'simple brown carpenter apron over work clothes, beret on head, wooden shoes',
        prop: 'carving knife, wooden puppet strings',
        mood: 'lonely but loving, fatherly',
      },
      {
        name: '蓝仙女',
        appearance: 'A kind fairy with blue skin and long blue hair, gentle and wise',
        costume: 'flowing blue fairy dress that sparkles like stars, blue wings, small blue stars in her hair',
        prop: 'wand that grants wishes, blue fairy dust',
        mood: 'magical, warm, guiding',
      },
    ],
    globalNote: 'Traditional Italian village atmosphere, carnival-like whimsy, wooden toy aesthetic',
  },

  'beauty-and-beast': {
    title: '美女与野兽',
    era: 'European baroque castle and French countryside setting',
    roles: [
      {
        name: '贝儿',
        appearance: 'A beautiful intelligent girl with warm brown eyes, flowing chestnut brown hair, book-lover expression, graceful and kind',
        costume: 'blue or yellow flowing countryside dress with white apron, comfortable flat shoes, sometimes a blue ribbon in her hair or a book in hand',
        prop: 'a rose or an old book',
        mood: 'gentle, brave, book-smart',
      },
      {
        name: '野兽',
        appearance: 'A large fantastical creature: hybrid of human and beast - tall muscular body covered in dark fur, human-like face but with beast features, big claws, sad expressive eyes, small horns',
        costume: 'elegant torn purple or dark blue velvet noble coat and pants, with gold trim (once royal)',
        prop: 'a single enchanted red rose under a glass dome, candlestick holder form (Lumière) nearby',
        mood: 'sad, lonely, angry but eventually gentle, hopeful',
      },
      {
        name: '加斯顿',
        appearance: 'A muscular handsome man but vain and arrogant, thick neck, smug smile',
        costume: 'rugged outdoorsman - brown leather vest, white shirt with rolled sleeves, hunting hat, muscular display',
        prop: 'hunting rifle or mustache comb',
        mood: 'boastful, selfish, villainous',
      },
    ],
    globalNote: 'Oppressive dark castle interior contrasted with sunny French countryside, Gothic romance atmosphere',
  },

  // ============================================================
  // 中国传统故事
  // ============================================================

  'yugong-yishan': {
    title: '愚公移山',
    era: 'Ancient Chinese setting during the reign of King Wu of Zhou (c. 1100-1046 BC), mountains and countryside',
    roles: [
      {
        name: '愚公',
        appearance: 'An elderly man with white hair, long white beard, kind wise eyes showing determination, weathered but strong face with wrinkles, upright posture for his age',
        costume: 'simple coarse brown hemp clothes (粗布短褐), tied waist with rope belt, bare feet or simple grass sandals (草鞋), no hat showing his age, slightly tattered but dignified clothing',
        prop: 'wooden shoulder pole (扁担), carrying baskets of earth and stones on his back, wooden hoe (锄头) leaning nearby',
        mood: 'persistent, resolute, elderly but spirited, determined despite age',
      },
      {
        name: '愚公妻子',
        appearance: 'An elderly woman with gray hair in a bun, kind motherly expression, round face with wrinkles',
        costume: 'simple gray-brown coarse linen clothes typical of ancient Chinese rural women, cloth headscarf, practical dark clothes',
        prop: 'carrying water urn or ladle, helping with household chores',
        mood: 'supportive, worried but loving, practical',
      },
      {
        name: '智叟',
        appearance: 'A middle-aged man with a skeptical smirk, neatly dressed but showing less character, looking smug about his wisdom',
        costume: 'slightly better quality clothes than the villagers - simple dark blue scholar-like robe, hat, neat appearance',
        prop: 'pointing finger as if explaining, or holding a book',
        mood: 'scoffing, self-important, dismissive',
      },
    ],
    globalNote: 'Ancient Chinese primitive village atmosphere, mountains in the background, simple mud houses, agricultural life, traditional Chinese ink painting style mixed with the chosen art style',
  },

  'meng-ke-gua-li': {
    title: '蒙眼画画',
    era: 'Modern art classroom or art studio setting',
    roles: [
      {
        name: '画家',
        appearance: 'A cheerful artist person, wearing an artistic beret or messy bun, colorful paint-stained smock',
        costume: 'oversized paint-splattered apron over casual clothes, colorful and creative outfit',
        prop: 'paintbrush in hand, blindfold on forehead or covering eyes',
        mood: 'playful, creative, experimental',
      },
    ],
    globalNote: 'Colorful art studio with paint splatters everywhere, creative chaos',
  },
};

// ============================================================
// 故事妆造配置类型
// ============================================================

export interface CostumeRole {
  name: string;
  appearance: string;
  costume: string;
  prop: string;
  mood: string;
}

export interface StoryCostumeProfile {
  title: string;
  era: string;
  roles: CostumeRole[];
  globalNote?: string;
}

// ============================================================
// 查询接口
// ============================================================

/**
 * 根据故事标题（中文或英文 ID）查找妆造配置
 */
export function getStoryCostumeProfile(storyTitle: string): StoryCostumeProfile | null {
  // 先尝试精确匹配 key
  if (STORY_COSTUME_PROFILES[storyTitle]) {
    return STORY_COSTUME_PROFILES[storyTitle];
  }

  // 模糊匹配：大小写不敏感，包含匹配
  const lowerTitle = storyTitle.toLowerCase();
  for (const [key, profile] of Object.entries(STORY_COSTUME_PROFILES)) {
    if (
      key.toLowerCase().includes(lowerTitle) ||
      profile.title.toLowerCase().includes(lowerTitle) ||
      lowerTitle.includes(profile.title.toLowerCase())
    ) {
      return profile;
    }
  }

  return null;
}

/**
 * 根据妆造配置生成风格化 prompt
 * @param profile 妆造配置
 * @param roleName 可选：指定角色名，默认取第一个角色
 * @param style 艺术风格（pixar/ghibli/clay/handdrawn/watercolor/paper/comic/papercut）
 */
export function buildCostumePrompt(
  profile: StoryCostumeProfile,
  roleName?: string,
  style?: 'pixar' | 'ghibli' | 'clay' | 'handdrawn' | 'watercolor' | 'paper' | 'comic' | 'papercut'
): string {
  const role = roleName
    ? profile.roles.find((r) => r.name.includes(roleName) || roleName.includes(r.name)) || profile.roles[0]
    : profile.roles[0];

  const styleSuffix = style
    ? {
        pixar: ' in Pixar 3D animation style, smooth rounded shapes, vibrant colors, expressive big eyes, on pure white background, vertical composition',
        ghibli: ' in Studio Ghibli anime style, hand-drawn cel animation look, warm colors, whimsical charm, on clean white background, vertical portrait orientation',
        clay: ' in claymation stop-motion style, Play-Doh texture, cute chunky proportions, on pure white background, vertical portrait',
        handdrawn: ' in hand-drawn illustration style, soft pencil and watercolor textures, warm gentle tones, on clean white background, vertical portrait orientation',
        watercolor: ' in premium watercolor style, flowing pigment washes, wet-on-wet bleeds, visible brushwork, paper grain, translucent layered glazes, on white background, vertical portrait',
        paper: ' in origami paper-craft style, faceted low-poly geometry, crisp folded paper edges, geometric planar surfaces, tactile handmade paper quality, on white background, vertical portrait',
        comic: ' in American comic-book style, bold ink outlines, flat saturated colors, Ben-Day halftone dots, dynamic pop-art speed lines, punchy primary palette, on white background, vertical portrait',
        papercut: ' in Chinese paper-cut / shadow-puppet style, flat planar shapes, ornamental symmetrical motifs, warm vermillion-and-gold lacquer palette, bold black contour outlines, on white background, vertical portrait',
      }[style]
    : '';

  return [
    `Setting: ${profile.era}`,
    `Character: ${role.appearance}`,
    `Costume: ${role.costume}`,
    `Prop: ${role.prop}`,
    `Personality/Mood: ${role.mood}`,
    profile.globalNote ? `Note: ${profile.globalNote}` : '',
    styleSuffix,
  ]
    .filter(Boolean)
    .join(', ');
}
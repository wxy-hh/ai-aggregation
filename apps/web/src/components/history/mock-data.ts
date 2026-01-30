'use client';

export interface HistoryItem {
    id: string;
    type: 'chat' | 'voice' | 'image';
    title: string;
    date: string;
    preview: string;
    tags?: string[];
    model?: string;
    duration?: string;
    imageUrl?: string;
}

export const mockHistory: HistoryItem[] = [
    // 对话历史
    {
        id: 'c1',
        type: 'chat',
        title: 'Q4 产品路线图讨论',
        date: '2小时前',
        preview: '根据我们之前的讨论，这里是更新后的Q4产品功能优先级列表。重点放在了用户引导流程的优化和API性能提升上。此外，关于移动端适配的...',
        tags: ['产品', '规划'],
        model: 'GPT-4o'
    },
    {
        id: 'c2',
        type: 'chat',
        title: '市场营销标语头脑风暴',
        date: '昨天',
        preview: '好的，针对“环保科技”这一主题，我构思了以下十个标语，旨在突出可持续发展与未来科技的结合：1. 智造未来，绿动生活。 2. 科技呼吸，自然韵律...',
        tags: ['创意', '营销'],
        model: 'Claude 3 Opus'
    },
    {
        id: 'c3',
        type: 'chat',
        title: '合作伙伴邮件草拟',
        date: '2天前',
        preview: '主题：关于深化战略合作的提议\n尊敬的李总，您好！\n很高兴上周能在峰会上与您交流。根据我们的谈话，我...',
        tags: ['邮件', '商务'],
        model: 'GPT-4'
    },

    // 语音历史
    {
        id: 'v1',
        type: 'voice',
        title: '产品研发周会记录',
        date: '15分钟前',
        preview: '关于下个季度的功能发布时间表，团队达成了基本一致意见。重点讨论了移动端适配的问题，建议增加两个测试周期...',
        duration: '45:20',
        model: 'Whisper v3'
    },
    {
        id: 'v2',
        type: 'voice',
        title: '个人笔记：AI伦理讲座',
        date: '昨天',
        preview: '演讲者强调了算法偏见对招聘流程的影响，并提出了建立审查机制的重要性。需要后续查阅相关论文...',
        duration: '01:12:45',
        model: 'Nova-2'
    },

    // 图片历史
    {
        id: 'i1',
        type: 'image',
        title: '赛博朋克风格咖啡馆',
        date: '10分钟前',
        preview: '生成的极简主义海报，展现未来城市景观，梦幻紫色色调。',
        imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop',
        model: 'DALL-E 3'
    },
    {
        id: 'i2',
        type: 'image',
        title: '未来建筑概念',
        date: '1小时前',
        preview: '参数化设计的摩天大楼，有机线条，玻璃幕墙，晨光...',
        imageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2670&auto=format&fit=crop',
        model: 'Midjourney v6'
    },
    {
        id: 'i3',
        type: 'image',
        title: '抽象3D渲染',
        date: '昨天',
        preview: '漂浮的几何体，金属材质，柔和光照，4k分辨率...',
        imageUrl: 'https://images.unsplash.com/photo-1614730341194-75c6074065db?q=80&w=2574&auto=format&fit=crop',
        model: 'Stable Diffusion'
    }
];

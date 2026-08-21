import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { FounderInfo, ServiceItem, PortfolioItem, Testimonial, InquiryLead, SiteAssets, SiteMetaInfo } from '../types';
import { FOUNDER_INFO, SERVICES_CATALOG, PORTFOLIO_CASES, TESTIMONIALS } from '../data/siteData';

interface DataContextType {
  assets: SiteAssets;
  siteInfo: SiteMetaInfo;
  founderInfo: FounderInfo;
  services: ServiceItem[];
  portfolio: PortfolioItem[];
  testimonials: Testimonial[];
  leads: InquiryLead[];
  isSyncingRemote: boolean;
  lastSyncTime: string | null;
  syncFromRemote: () => Promise<void>;
  updateAssets: (data: Partial<SiteAssets>) => void;
  updateSiteInfo: (data: Partial<SiteMetaInfo>) => void;
  addLead: (lead: Partial<InquiryLead>) => void;
  updateFounderInfo: (data: Partial<FounderInfo>) => void;
  updateSocials: (data: Partial<FounderInfo['socials']>) => void;
  addService: (service: ServiceItem) => void;
  updateService: (service: ServiceItem) => void;
  deleteService: (id: string) => void;
  addPortfolioItem: (item: PortfolioItem) => void;
  updatePortfolioItem: (item: PortfolioItem) => void;
  deletePortfolioItem: (id: string) => void;
  addTestimonial: (testimonial: Testimonial) => void;
  updateTestimonial: (testimonial: Testimonial) => void;
  deleteTestimonial: (id: string) => void;
  resetToDefault: () => void;
}

const STORAGE_KEYS = {
  ASSETS: 'cine_dimension_assets_v15',
  SITE_INFO: 'cine_dimension_siteinfo_v15',
  FOUNDER: 'cine_dimension_founder_v15',
  SERVICES: 'cine_dimension_services_v15',
  PORTFOLIO: 'cine_dimension_portfolio_v15',
  TESTIMONIALS: 'cine_dimension_testimonials_v15',
  LEADS: 'cinedimension_inquiries'
};

const CANONICAL_ID_MAP: Record<string, string> = {
  'chiayi-farmers-workshop': 'zhuqi-farmers-association',
  'zhuqi-farmers-short-video': 'zhuqi-farmers-association',
  'zhuqi-farmers-association': 'zhuqi-farmers-association',
  
  'kaohsiung-qijin-travel-film': 'kaohsiung-qijin-travel-film',
  
  'jimo-ancient-city-film': 'jimo-ancient-city-film',
  
  'indie-music-video': 'band-mv-music-video',
  'band-mv-music-video': 'band-mv-music-video',
  
  'shell-app-guide': 'shell-lubricants-ad',
  'shell-helix-app-promo-guide': 'shell-lubricants-ad',
  'shell-lubricants-ad': 'shell-lubricants-ad',
  'shell-helix-promo': 'shell-lubricants-ad',
  
  'wedding-films-collection': 'wedding-films-collection',
  'wedding-film-collection': 'wedding-films-collection',
  'wedding-films': 'wedding-films-collection'
};

function getCanonicalId(item: Partial<PortfolioItem>): string {
  if (item.id && CANONICAL_ID_MAP[item.id]) {
    return CANONICAL_ID_MAP[item.id];
  }
  
  const title = (item.title || '').toLowerCase();
  const videoUrl = item.videoUrl || '';
  
  if (title.includes('竹崎') || title.includes('青農') || title.includes('農會') || videoUrl.includes('_JjmH05QYlU')) {
    return 'zhuqi-farmers-association';
  }
  if (title.includes('旗津') || title.includes('高雄') || videoUrl.includes('eFJcTN9lt9s')) {
    return 'kaohsiung-qijin-travel-film';
  }
  if (title.includes('即墨') || title.includes('古城') || videoUrl.includes('G09UZtpbyN0')) {
    return 'jimo-ancient-city-film';
  }
  if (title.includes('說不愛就不愛') || title.includes('樂團') || videoUrl.includes('5p7nMVHx-AE')) {
    return 'band-mv-music-video';
  }
  if (title.includes('shell') || title.includes('喜力') || title.includes('保修') || title.includes('殼牌')) {
    return 'shell-lubricants-ad';
  }
  if (title.includes('婚禮') || title.includes('wedding') || videoUrl.includes('owTBrg-aBhE')) {
    return 'wedding-films-collection';
  }
  
  return item.id || `custom-${Date.now()}`;
}

function mergePortfolioWithDefaults(remoteItems: PortfolioItem[] | undefined, defaultCases: PortfolioItem[]): PortfolioItem[] {
  if (!remoteItems || !Array.isArray(remoteItems) || remoteItems.length === 0) {
    return defaultCases;
  }
  
  // Normalize remote items map by canonical ID
  const remoteMap = new Map<string, PortfolioItem>();
  remoteItems.forEach(rawItem => {
    if (rawItem) {
      const canonicalId = getCanonicalId(rawItem);
      const existing = remoteMap.get(canonicalId);
      if (existing) {
        remoteMap.set(canonicalId, {
          ...existing,
          ...rawItem,
          id: canonicalId,
          image: rawItem.image || existing.image,
          videoUrl: rawItem.videoUrl || existing.videoUrl
        });
      } else {
        remoteMap.set(canonicalId, { ...rawItem, id: canonicalId });
      }
    }
  });

  const merged: PortfolioItem[] = [];
  const processedCanonicalIds = new Set<string>();

  // 1. Process all default cases in strict order
  for (const defCase of defaultCases) {
    const canonicalId = getCanonicalId(defCase);
    processedCanonicalIds.add(canonicalId);
    
    const remote = remoteMap.get(canonicalId);
    if (remote) {
      let resolvedImage = remote.image || defCase.image;
      // If remote image is the outdated Unsplash placeholder for Shell, use defCase.image (/images/shell.svg)
      if (canonicalId === 'shell-lubricants-ad' && (resolvedImage.includes('photo-1486006920555') || !resolvedImage)) {
        resolvedImage = defCase.image || '/images/shell.svg';
      }

      merged.push({
        ...defCase,
        ...remote,
        id: canonicalId,
        title: defCase.title,
        category: defCase.category,
        clientOrProject: defCase.clientOrProject,
        year: defCase.year,
        description: defCase.description,
        role: defCase.role,
        tags: defCase.tags,
        image: resolvedImage,
        videoUrl: defCase.videoUrl || remote.videoUrl,
        highlights: defCase.highlights
      });
      remoteMap.delete(canonicalId);
    } else {
      merged.push(defCase);
    }
  }

  // 2. Append genuine new user-created custom items (not aliases of the 6 defaults)
  for (const [key, extraItem] of remoteMap.entries()) {
    if (!processedCanonicalIds.has(key)) {
      processedCanonicalIds.add(key);
      merged.push(extraItem);
    }
  }

  return merged;
}

const DEFAULT_ASSETS: SiteAssets = {
  logo: '/images/logo.svg',
  founderImage: '/images/avatar.svg'
};

const DEFAULT_SITE_INFO: SiteMetaInfo = {
  title: '維度影學 Cine Dimension',
  tagline: 'Have Fun 享受創作 ｜ 用手機拍出真實的電影感',
  email: 'hi@cine-dimension.com',
  youtube: '@cinedimens',
  facebook: '維度影學 Cine Dimension',
  instagram: ''
};

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [assets, setAssets] = useState<SiteAssets>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ASSETS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading assets from localStorage:', e);
    }
    return DEFAULT_ASSETS;
  });

  const [siteInfo, setSiteInfo] = useState<SiteMetaInfo>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SITE_INFO);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading site info from localStorage:', e);
    }
    return DEFAULT_SITE_INFO;
  });

  const [founderInfo, setFounderInfo] = useState<FounderInfo>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FOUNDER);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading founder info from localStorage:', e);
    }
    return FOUNDER_INFO;
  });

  const [services, setServices] = useState<ServiceItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SERVICES);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading services from localStorage:', e);
    }
    return SERVICES_CATALOG;
  });

  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PORTFOLIO);
      if (saved) {
        const parsed = JSON.parse(saved);
        return mergePortfolioWithDefaults(parsed, PORTFOLIO_CASES);
      }
    } catch (e) {
      console.error('Error loading portfolio from localStorage:', e);
    }
    return PORTFOLIO_CASES;
  });

  const [testimonials, setTestimonials] = useState<Testimonial[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TESTIMONIALS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading testimonials from localStorage:', e);
    }
    return TESTIMONIALS;
  });

  const [leads, setLeads] = useState<InquiryLead[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LEADS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading leads from localStorage:', e);
    }
    return [];
  });

  const [isSyncingRemote, setIsSyncingRemote] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Sync to local storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ASSETS, JSON.stringify(assets));
    } catch (e) {
      console.error('Failed to save assets', e);
    }
  }, [assets]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SITE_INFO, JSON.stringify(siteInfo));
    } catch (e) {
      console.error('Failed to save siteInfo', e);
    }
  }, [siteInfo]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.FOUNDER, JSON.stringify(founderInfo));
    } catch (e) {
      console.error('Failed to save founder info', e);
    }
  }, [founderInfo]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(services));
    } catch (e) {
      console.error('Failed to save services', e);
    }
  }, [services]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PORTFOLIO, JSON.stringify(portfolio));
    } catch (e) {
      console.error('Failed to save portfolio', e);
    }
  }, [portfolio]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TESTIMONIALS, JSON.stringify(testimonials));
    } catch (e) {
      console.error('Failed to save testimonials', e);
    }
  }, [testimonials]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LEADS, JSON.stringify(leads));
    } catch (e) {
      console.error('Failed to save leads', e);
    }
  }, [leads]);

  // Sync from remote (GitHub content.json / Cloudflare Worker / public content.json / server disk sync)
  const syncFromRemote = useCallback(async () => {
    setIsSyncingRemote(true);
    const workerUrl = (localStorage.getItem('cms_worker_url') || '').trim().replace(/\/+$/, '');
    const token = (localStorage.getItem('cms_auth_token') || '').trim();

    // Trigger local server-side GitHub fetch in dev mode to ensure container files are updated
    try {
      fetch('/api/sync-github-content').catch(() => {});
    } catch (e) {}

    const fetchSources: { name: string; url: string; headers?: Record<string, string> }[] = [];

    // 1. Worker API endpoint (if workerUrl configured)
    if (workerUrl && token) {
      fetchSources.push({
        name: 'Cloudflare Worker API',
        url: `${workerUrl}/api/content`,
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }

    // 2. Direct GitHub Raw URL (Always fresh from cindimenswebsite1 repo)
    fetchSources.push({
      name: 'GitHub Raw Content (cindimenswebsite1)',
      url: `https://raw.githubusercontent.com/select03/cindimenswebsite1/main/content.json?_t=${Date.now()}`
    });

    // Fallback: previous repo name if migrated
    fetchSources.push({
      name: 'GitHub Raw Content (cindimenswebsite fallback)',
      url: `https://raw.githubusercontent.com/select03/cindimenswebsite/main/content.json?_t=${Date.now()}`
    });

    // 3. Local / public content.json
    fetchSources.push({
      name: 'Local Site Content JSON',
      url: `/content.json?_t=${Date.now()}`
    });

    let rawData: any = null;

    for (const source of fetchSources) {
      try {
        const res = await fetch(source.url, {
          headers: source.headers || {},
          cache: 'no-store'
        });
        if (res.ok) {
          const json = await res.json();
          // Worker returns { exists: true, content: {...} }, Raw returns {...} directly
          rawData = json.content || json;
          if (rawData && (rawData.portfolio || rawData.assets || rawData.siteInfo)) {
            break;
          }
        }
      } catch (err) {
        // Try next source
      }
    }

    if (rawData) {
      // A. Update Assets (Logo & Founder Avatar)
      if (rawData.assets) {
        const newLogo = (rawData.assets.logo || '').trim();
        const newFounderImg = (rawData.assets.founderImage || rawData.assets.avatar || '').trim();

        setAssets(prev => ({
          ...prev,
          logo: newLogo || prev.logo || '/images/logo.svg',
          founderImage: newFounderImg || prev.founderImage || '/images/avatar.svg'
        }));

        if (newFounderImg) {
          setFounderInfo(prev => ({
            ...prev,
            image: newFounderImg
          }));
        }
      }

      // B. Update Site Info & Socials
      if (rawData.siteInfo) {
        setSiteInfo(prev => ({
          ...prev,
          ...rawData.siteInfo
        }));

        if (rawData.siteInfo.email || rawData.siteInfo.youtube || rawData.siteInfo.facebook) {
          setFounderInfo(prev => ({
            ...prev,
            socials: {
              ...prev.socials,
              email: rawData.siteInfo.email || prev.socials.email,
              youtube: rawData.siteInfo.youtube || prev.socials.youtube,
              facebook: rawData.siteInfo.facebook || prev.socials.facebook,
              instagram: rawData.siteInfo.instagram || prev.socials.instagram
            }
          }));
        }
      }

      // C. Update Portfolio (Shell image, Chiayi Farmers workshop, etc.)
      if (Array.isArray(rawData.portfolio) && rawData.portfolio.length > 0) {
        setPortfolio(mergePortfolioWithDefaults(rawData.portfolio, PORTFOLIO_CASES));
      }

      setLastSyncTime(new Date().toLocaleTimeString('zh-TW', { hour12: false }));
    }

    setIsSyncingRemote(false);
  }, []);

  // Fetch on mount and listen to custom updates
  useEffect(() => {
    syncFromRemote();

    const handleContentUpdated = () => {
      syncFromRemote();
    };

    window.addEventListener('cinedimension_content_updated', handleContentUpdated);
    window.addEventListener('storage', handleContentUpdated);

    return () => {
      window.removeEventListener('cinedimension_content_updated', handleContentUpdated);
      window.removeEventListener('storage', handleContentUpdated);
    };
  }, [syncFromRemote]);

  const updateAssets = (data: Partial<SiteAssets>) => {
    setAssets(prev => {
      const next = { ...prev, ...data };
      const newImg = data.founderImage || data.avatar;
      if (newImg) {
        next.founderImage = newImg;
        next.avatar = newImg;
        setFounderInfo(f => ({ ...f, image: newImg }));
      }
      return next;
    });
  };

  const updateSiteInfo = (data: Partial<SiteMetaInfo>) => {
    setSiteInfo(prev => ({ ...prev, ...data }));
  };

  const addLead = (lead: Partial<InquiryLead>) => {
    const newLeadItem: InquiryLead = {
      id: lead.id || 'lead-' + Date.now(),
      timestamp: lead.timestamp || new Date().toLocaleString(),
      name: lead.name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      organization: lead.organization || '',
      serviceType: lead.serviceType || lead.serviceRequested || '',
      serviceRequested: lead.serviceType || lead.serviceRequested || '',
      budgetRange: lead.budgetRange || '',
      preferredTime: lead.preferredTime || '',
      message: lead.message || '',
      driveStatus: lead.driveStatus || 'Local Recorded',
      botVerified: lead.botVerified ?? true
    };
    setLeads(prev => [newLeadItem, ...prev]);
  };

  const updateFounderInfo = (data: Partial<FounderInfo>) => {
    setFounderInfo(prev => ({ ...prev, ...data }));
  };

  const updateSocials = (data: Partial<FounderInfo['socials']>) => {
    setFounderInfo(prev => ({
      ...prev,
      socials: { ...prev.socials, ...data }
    }));
  };

  const addService = (service: ServiceItem) => {
    setServices(prev => [service, ...prev]);
  };

  const updateService = (updated: ServiceItem) => {
    setServices(prev => prev.map(s => (s.id === updated.id ? updated : s)));
  };

  const deleteService = (id: string) => {
    setServices(prev => prev.filter(s => s.id !== id));
  };

  const addPortfolioItem = (item: PortfolioItem) => {
    setPortfolio(prev => [item, ...prev]);
  };

  const updatePortfolioItem = (updated: PortfolioItem) => {
    setPortfolio(prev => prev.map(p => (p.id === updated.id ? updated : p)));
  };

  const deletePortfolioItem = (id: string) => {
    setPortfolio(prev => prev.filter(p => p.id !== id));
  };

  const addTestimonial = (item: Testimonial) => {
    setTestimonials(prev => [item, ...prev]);
  };

  const updateTestimonial = (updated: Testimonial) => {
    setTestimonials(prev => prev.map(t => (t.id === updated.id ? updated : t)));
  };

  const deleteTestimonial = (id: string) => {
    setTestimonials(prev => prev.filter(t => t.id !== id));
  };

  const resetToDefault = () => {
    localStorage.removeItem(STORAGE_KEYS.ASSETS);
    localStorage.removeItem(STORAGE_KEYS.SITE_INFO);
    localStorage.removeItem(STORAGE_KEYS.FOUNDER);
    localStorage.removeItem(STORAGE_KEYS.SERVICES);
    localStorage.removeItem(STORAGE_KEYS.PORTFOLIO);
    localStorage.removeItem(STORAGE_KEYS.TESTIMONIALS);
    setAssets(DEFAULT_ASSETS);
    setSiteInfo(DEFAULT_SITE_INFO);
    setFounderInfo(FOUNDER_INFO);
    setServices(SERVICES_CATALOG);
    setPortfolio(PORTFOLIO_CASES);
    setTestimonials(TESTIMONIALS);
  };

  return (
    <DataContext.Provider
      value={{
        assets,
        siteInfo,
        founderInfo,
        services,
        portfolio,
        testimonials,
        leads,
        isSyncingRemote,
        lastSyncTime,
        syncFromRemote,
        updateAssets,
        updateSiteInfo,
        addLead,
        updateFounderInfo,
        updateSocials,
        addService,
        updateService,
        deleteService,
        addPortfolioItem,
        updatePortfolioItem,
        deletePortfolioItem,
        addTestimonial,
        updateTestimonial,
        deleteTestimonial,
        resetToDefault
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useSiteData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useSiteData must be used within a DataProvider');
  }
  return context;
};

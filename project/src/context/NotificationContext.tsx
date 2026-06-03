import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    ReactNode,
  } from "react";
  
  type NotificationCounts = {
    outOfStock: number;
    lowStock: number;
    pendingOrders: number;
    total: number;
  };
  
  type NotificationContextType = {
    counts: NotificationCounts;
    refreshNotifications: () => Promise<void>;
  };
  
  const NotificationContext = createContext<NotificationContextType | undefined>(
    undefined
  );
  
  export const NotificationProvider = ({
    children,
  }: {
    children: ReactNode;
  }) => {
    const [counts, setCounts] = useState<NotificationCounts>({
      outOfStock: 0,
      lowStock: 0,
      pendingOrders: 0,
      total: 0,
    });
  
    const refreshNotifications = async () => {
      try {
        /**
         * سيتم هنا لاحقاً نقل منطق AlertsPage
         * واستدعاءات Supabase الحقيقية
         */
      } catch (error) {
        console.error("Notification refresh error:", error);
      }
    };
  
    useEffect(() => {
      refreshNotifications();
  
      const interval = setInterval(() => {
        refreshNotifications();
      }, 60000);
  
      return () => clearInterval(interval);
    }, []);
  
    return (
      <NotificationContext.Provider
        value={{
          counts,
          refreshNotifications,
        }}
      >
        {children}
      </NotificationContext.Provider>
    );
  };
  
  export const useNotifications = () => {
    const context = useContext(NotificationContext);
  
    if (!context) {
      throw new Error(
        "useNotifications must be used inside NotificationProvider"
      );
    }
  
    return context;
  };